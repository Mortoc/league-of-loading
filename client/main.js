function customShowStaggeredList(selector, options) {
  var time = 0;
  var _options = { duration: 800, elementDelay: 120 };
  function applyOption(defaults, options, field) {
    if( options && _.isNumber(options[field]) ) {
      defaults[field] = options[field];
    }
  }

  applyOption(_options, options, "duration");
  applyOption(_options, options, "elementDelay");

  $(selector).find('li').velocity(
      { translateX: "-100px"},
      { duration: 0 });

  $(selector).find('li').each(function() {
    $(this).velocity(
      { opacity: "1", translateX: "0"},
      { duration: _options.duration, delay: time, easing: [60, 10] });
    time += _options.elementDelay;
  });
}

var animateInPlayerList = _.debounce(function(){
  customShowStaggeredList("#participant-list", {
    duration: 500,
    elementDelay: 30
  });

  $('.collapsible').collapsible({
    accordion: false
  });

  $('ul.tabs').tabs();

  $('.participant-listing').one("click", function(){
    $(this).find(".tab .active").click();
  });
}, 500);

function updateCurrentGame(currentGame) {
  // there weren't players and now there are
  var oldSessionGame = Session.get('currentGame');

  if( (!oldSessionGame || !oldSessionGame.players) &&
      (currentGame && currentGame.players) ) {
    animateInPlayerList();
  }

  Session.set('currentGame', currentGame);
}

function ritoPlsStripBuggedEndTagsFromArray(array) {
  return _.map(array, function(str){
    if(!_.isString(str)) {
      throw {
        exception: "InvalidOperation",
        message: "all the elements of the array should be strings"
      };
    }

    if( str.endsWith("</li>") ) {
      return str.substring(0, str.length - "</li>".length);
    }
    return str;
  })
}

function setupChampInfo(response, currentGame) {
  var team1Id = null;
  var localSummonerTeamId = null;
  var localSummoner = Session.get("localSummoner");

  _.each(response.participants, function(participant){
    if( team1Id === null ) {
      team1Id = participant.teamId;
    }
    if( participant.summonerId === localSummoner.summonerId ) {
      localSummonerTeamId = participant.teamId;
    }
  });

  var callsReturned = 0;
  _.each(response.participants, function(participant){

    Meteor.call("riotStaticDataChampion", participant.championId, function(err, champResponse){
      if( err ) {
        console.error(err);
      } else {
        champResponse.image.full = "http://ddragon.leagueoflegends.com/cdn/" + LATEST_LOL_VERSION + "/img/champion/" + champResponse.image.full;
        participant.championInfo = champResponse;

        // some of ritos data is coming back with a random html tag at the end of the string
        participant.championInfo.allytips = ritoPlsStripBuggedEndTagsFromArray(participant.championInfo.allytips);
        participant.championInfo.enemytips = ritoPlsStripBuggedEndTagsFromArray(participant.championInfo.enemytips);

        participant.isAlly = participant.teamId == localSummonerTeamId;
        if( participant.teamId === team1Id ) {
          participant.team = "blue-team";
        } else {
          participant.team = "purple-team";
        }
        currentGame.players.push(participant);
        currentGame.players = _.sortBy(currentGame.players, function(p){
          return p.teamId;
        });

        // Only update when all the calls have returned
        callsReturned++;
        if( callsReturned === response.participants.length) {
          updateCurrentGame(currentGame);
        }
      }
    });
  });
}

function isLeagueWithRanks(tierName) {
  return _.contains([
    "bronze",
    "diamond",
    "gold",
    "platinum",
    "silver"
  ], tierName.toLowerCase());
}

function leagueIconUrl(league) {
  var tier = league.tier.toLowerCase();

  if( isLeagueWithRanks(tier) ) {
    var rank = _.first(league.entries).division.toLowerCase();
    return "img/ranked/tier_icons/" + tier + "_" + rank + ".png"
  } else {
    return "img/ranked/base_icons/" + tier + ".png";
  }
}

function leagueDisplayText(league){
  var tier = league.tier.charAt(0).toUpperCase() + league.tier.slice(1).toLowerCase();
  if( isLeagueWithRanks(tier) ) {
    tier = tier + " " + _.first(league.entries).division;
  }
  return tier;
}

function setupSummonerInfo(response, currentGame) {
  var summonerIds = _.pluck(response.participants, "summonerId");

  setTimeout(function(){
    console.log("making the call");
    Meteor.call("summonerRecentStats", summonerIds, function(err, resp) {
      console.log(resp);
    });
  }, 10001);


  Meteor.call("riotLeagueBySummonerEntry", summonerIds, function(err, summonerLeagues){
    _.each(_.keys(summonerLeagues), function(summonerId) {

      var soloQueueLeague = _.findWhere(summonerLeagues[summonerId], {
        queue: "RANKED_SOLO_5x5"
      });
      if( !soloQueueLeague ) {
        soloQueueLeague = {
          tier: "PROVISIONAL"
        };
      }
      var participant = _.findWhere(response.participants, {
        summonerId: parseInt(summonerId)
      });

      participant.soloQueueLeague = soloQueueLeague;
      participant.soloQueueLeague.iconUrl = leagueIconUrl(soloQueueLeague);
      participant.soloQueueLeague.displayText = leagueDisplayText(soloQueueLeague);

      updateCurrentGame(currentGame);
    });
  });
}

function processGameResponse(response) {
  var currentGame = {
      players: [],
      riotData: response
  };

  setupChampInfo(response, currentGame);
  setupSummonerInfo(response, currentGame);
}

function resetApp() {
  $('.summoner-name').val("");
  $('.not-in-game-text').hide();
  localStorage.removeItem("localSummoner");
  Session.set('localSummoner', null);
  Session.set('currentGame', null);
  $('.enter-summoner-name-modal').openModal();
  $('.summoner-name').focus();
}

var isCheckingCurrentGame = false;
function checkCurrentGame() {

  try{
    if( isCheckingCurrentGame ) {
      return;
    }

    $('.not-in-game-text').hide();
    $('.checking-game-indicator').fadeIn();

    var localSummoner = Session.get('localSummoner');
    if( !localSummoner ) {
      throw {
        exception: "InvalidOperation",
        message: "localSummoner isn't in this Session, cannot check current game"
      };
    }

    isCheckingCurrentGame = true;
    Meteor.call("riotCurrentGame", localSummoner.summonerId, function(error, response){
      isCheckingCurrentGame = false;

      if( error ) {
        console.error(error);
      } else if( response == "NoCurrentGame") {
        $('.not-in-game-text').fadeIn();
        $('.checking-game-indicator').hide();
      } else if( response ) {
        processGameResponse(response);
      } else {
        console.error(response);
      }
    });
  } catch(e) {
    console.error(e);
    resetApp();
  }
}

function setSummonerName() {
  var name = $('.summoner-name').val();

  Meteor.call("riotSummonerByName", name, function(error, results){
    $('.enter-summoner-name-modal').closeModal();

    if( error ) {
      console.error(error);
    } else {
      if( !results || results == "NotFound" ) {
        alert("Summoner name not found");
        resetApp();
      } else {
        setLocalSummoner(results);
        checkCurrentGame();
      }
    }
  });
}

function setLocalSummoner(localSummoner) {
  localStorage.setItem("localSummoner", JSON.stringify(localSummoner));
  Session.set('localSummoner', localSummoner);
  ga("set", "&uid", localSummoner.name);
}

Meteor.startup(function(){
  setupAds();
  $(".button-collapse").sideNav();
  $('.checking-game-indicator').hide();
  var localSummoner = localStorage.getItem("localSummoner");
  if( !localSummoner ) {
    resetApp();
  } else {
    setLocalSummoner(JSON.parse(localSummoner));
    checkCurrentGame();
  }
  Meteor.call("riotCurrentVersion", function(err, version){
    if( err ) {
      console.error(err);
    } else {
      LATEST_LOL_VERSION = version;
    }
  });
});

Template.body.helpers({
  summoner: function(){
    return Session.get('localSummoner');
  },
  currentGame: function(){
    return Session.get('currentGame');
  },
  noCurrentGame: function(){
    return !Session.get('currentGame');
  }
});

Template.body.events({
  'keypress input.summoner-name': function (evt, template) {
    if (evt.which === 13) {
      setSummonerName();
    }
  },
  'click .load-summoner': setSummonerName,
  'click .refresh-game': _.throttle(checkCurrentGame, 2500),
  'click .change-summoner': resetApp,
});