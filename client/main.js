var LATEST_LOL_VERSION = null;

function reportError() {
  console.error(arguments);
  if( Meteor.isCordova ) {
    alert(_.map(arguments, function(arg){
      return JSON.stringify(arg);
    }).join("\n"));
  }
}

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
  return time;
}

var animateInPlayerList = _.debounce(function(){
  var listAnimateInTime = customShowStaggeredList("#participant-list", {
    duration: 400,
    elementDelay: 30
  });

  $(".current-game .refresh-game").velocity({
    opacity: "1"
  }, {
    duration: 500,
    delay: listAnimateInTime
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

function setupSummonerStats(summonerIds) {
  Meteor.call("summonerRecentStats", summonerIds, function(err, statsBySummoner) {
    if( err ) {
      reportError(err);
    } else {
      var currentGame = Session.get("currentGame");
      _.each(currentGame.players, function(participant){
        var stats = statsBySummoner[participant.summonerId];
        if( stats ){
          participant.stats = {
            mostCommonRole: roleToDisplayName(stats.mostCommonRole),
            visionControlRating: summonerStatRating(
              average(stats.wardsKilled, stats.wardsPlaced)
            ),

            deaths: summonerStatRating(stats.deaths),

            towerFocus: summonerStatRating(
              average(
                Math.max(stats.firstInhibitorAssist, stats.firstInhibitorKill),
                Math.max(stats.firstTowerAssist, stats.firstTowerKill),
                stats.towerKills
              )
            ),

            killsAndAssists: summonerStatRating(
              Math.max(stats.kills, stats.assists)
            ),

            likelyToInvadeJungle: summonerStatRating(
              stats.neutralMinionsKilledEnemyJungle
            ),

            farmRating: summonerStatRating(
              average(stats.minionsKilled, stats.neutralMinionsKilledTeamJungle)
            )
          };
        }
      });

      updateCurrentGame(currentGame);
    }
  });
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
        reportError(err);
      } else {
        champResponse.image.full = "http://ddragon.leagueoflegends.com/cdn/" + LATEST_LOL_VERSION + "/img/champion/" + champResponse.image.full;
        participant.championInfo = champResponse;

        // some of ritos data is coming back with a random html tag at the end of the string
        participant.championInfo.allytips = ritoPlsStripBuggedEndTagsFromArray(participant.championInfo.allytips);
        participant.championInfo.enemytips = ritoPlsStripBuggedEndTagsFromArray(participant.championInfo.enemytips);

        participant.isAlly = participant.teamId == localSummonerTeamId;
        if( participant.teamId === team1Id ) {
          participant.team = "blue-team";
          participant.teamText = "indigo-text lighten-1";
        } else {
          participant.team = "purple-team";
          participant.teamText = "purple-text darken-1";
        }
        currentGame.players.push(participant);
        currentGame.players = _.sortBy(currentGame.players, function(p){
          return p.teamId;
        });

        // Only update when all the calls have returned
        callsReturned++;
        if( callsReturned === response.participants.length) {
          updateCurrentGame(currentGame);

          Meteor.defer(function(){
            $(".participant-listing").one("click", function(){
              var clickedSummonerId = parseInt($(this).attr("data-summoner-id"));
              setupSummonerStats([clickedSummonerId]);
            });
          });
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

function average(/* ... */) {
  return _.reduce(arguments, function(memo, arg){
    return memo + arg;
  }, 0) / arguments.length;
}

function summonerStatRating(percentage) {
  if( percentage > 1.25 ) {
    return "God Tier";
  } else if( percentage > 1.05 ) {
    return "Above Average";
  } else if( percentage > 0.95 ) {
    return "Average";
  } else if( percentage > 0.75 ) {
    return "Below Average";
  } else {
    return "Garbage";
  }
}

function roleToDisplayName(laneRole) {
  var laneRoleSplit = laneRole.split(" ");
  var role = laneRoleSplit[0];
  var lane = laneRoleSplit[1];

  if( role == "DUO_SUPPORT") {
    return "Support";
  }

  if( lane == "JUNGLE" ) {
    return "Jungle";
  } else if( lane == "MIDDLE" ) {
    return "Mid Lane";
  } else if( lane == "BOTTOM" ) {
    if( role == "DUO") {
      return "Bot Lane Carry";
    } else {
      return "Bot Lane";
    }
  } else if( lane == "TOP" ) {
    return "Top Lane";
  }
}

function setupSummonerSpells(participants, currentGame) {
  Meteor.call("riotStaticDataSpells", function(err, response){
    if( err) {
      reportError(err);
      return;
    }

    _.each(participants, function(participant) {
      var spell1 = _.findWhere(response.data, {id: participant.spell1Id});
      var spell2 = _.findWhere(response.data, {id: participant.spell2Id});

      participant.spell1Url = "http://ddragon.leagueoflegends.com/cdn/" + LATEST_LOL_VERSION + "/img/spell/" + spell1.image.full;
      participant.spell2Url = "http://ddragon.leagueoflegends.com/cdn/" + LATEST_LOL_VERSION + "/img/spell/" + spell2.image.full;
    });

    updateCurrentGame(currentGame);
  });
}

function setupSummonerInfo(response, currentGame) {
  setupSummonerSpells(response.participants, currentGame);

  var summonerIds = _.pluck(response.participants, "summonerId");
  var localSummoner = Session.get("localSummoner");

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


function setupSummonerSpells(participants) {
  _.each(participants, function(participant) {
    participant.spell1Url = "http://ddragon.leagueoflegends.com/cdn/5.2.1/img/spell/SummonerFlash.png";
    participant.spell2Url = "http://ddragon.leagueoflegends.com/cdn/5.2.1/img/spell/SummonerFlash.png";
  });
}
  setupChampInfo(response, currentGame);
  setupSummonerInfo(response, currentGame);
  setupSummonerSpells(response.participants);

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
  try {
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
        reportError(error);
      } else if( response == "NoCurrentGame") {
        $('.not-in-game-text').fadeIn();
        $('.checking-game-indicator').hide();
      } else if( response ) {
        processGameResponse(response);
      } else {
        reportError(response);
      }
    });
  } catch(e) {
    reportError(e);
    resetApp();
    isCheckingCurrentGame = false;
  }
}

function setSummonerName() {
  var name = $('.summoner-name').val();

  Meteor.call("riotSummonerByName", name, function(error, results){
    $('.enter-summoner-name-modal').closeModal();

    if( error ) {
      reportError(error);
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
      reportError(err);
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
  'click .refresh-game': checkCurrentGame,
  'click .change-summoner': resetApp
});
