
var Summoners = new Mongo.Collection("summoners");
var CurrentGames = new Mongo.Collection("currentGames");
var LEAD_BOLT_API_KEY = "Oo36kxpKGQoqYLqmv4o7pOu7RwWkGo5n";

if (Meteor.isClient) {
  var LATEST_LOL_VERSION = null;

  function updateCurrentGame(currentGame) {
    Session.set('currentGame', currentGame);
    $('.collapsible').collapsible({
      accordion: false
    });
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
        console.log(str);
        return str.substring(0, str.length - "</li>".length);
      }
      return str;
    })
  }

  function setupChampInfo(response, currentGame) {
    var team1Id = null;
    var localSummonerTeamId = null;
    var localSummoner = Session.get("localSummoner").riotData;

    _.each(response.riotData.participants, function(participant){
      if( team1Id === null ) {
        team1Id = participant.teamId;
      }
      if( participant.summonerId === localSummoner.id ) {
        localSummonerTeamId = participant.teamId;
      }
    });

    _.each(response.riotData.participants, function(participant){
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
          updateCurrentGame(currentGame);
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
    Meteor.call("riotLeagueBySummonerEntry", _.pluck(response.riotData.participants, "summonerId"), function(err, summonerLeagues){
      _.each(_.keys(summonerLeagues), function(summonerId) {

        var soloQueueLeague = _.findWhere(summonerLeagues[summonerId], {
          queue: "RANKED_SOLO_5x5"
        });
        if( !soloQueueLeague ) {
          soloQueueLeague = {
            tier: "PROVISIONAL"
          };
        }
        var participant = _.findWhere(response.riotData.participants, {
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
      Meteor.call("riotCurrentGame", localSummoner.riotData.id, function(error, response){
        isCheckingCurrentGame = false;

        if( error ) {
          console.error(error);
        } else if( response ) {
          processGameResponse(response);
        } else {
          $('.not-in-game-text').fadeIn();
          $('.checking-game-indicator').hide();
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
        if( !results ) {
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

  function setupAds() {
    // AppTracker.startSession(LEAD_BOLT_API_KEY);
    // AppTracker.loadModuleToCache("inapp");
    // AppTracker.loadModule("inapp");
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
    'click .refresh-current-game': _.throttle(checkCurrentGame, 2500),
    'click .change-summoner': resetApp,
  });
}

if (Meteor.isServer){
  // Needs to be changed to an env variable
  var RIOT_API_KEY = "d5a72743-9f89-4fd4-94d6-88cc37498658";

  Meteor.methods({
    riotCurrentVersion: function() {
      var response = HTTP.get("https://global.api.pvp.net/api/lol/static-data/na/v1.2/versions", {
        params: {
          api_key: RIOT_API_KEY
        }
      });
      return _.first(EJSON.parse(response.content));
    },
    riotSummonerByName: function(name) {
      var REFRESH_SUMMONER_TIME = moment() - moment(12, "hours");
      name = name.toLowerCase().replace(/\s/g, '');

      var summoner = Summoners.findOne({
        name: name
      });

      if( summoner && moment(summoner.refreshedAt).isBefore(REFRESH_SUMMONER_TIME) ){
        console.log("riotSummonerByName: Avoiding RiotAPI call, using cached data");
        return summoner;
      } else {
        try{
          console.log("riotSummonerByName: Hitting RiotAPI");
          var response = HTTP.get("https://na.api.pvp.net/api/lol/na/v1.4/summoner/by-name/" + name, {
            params: {
              api_key: RIOT_API_KEY
            }
          });

          var payload = EJSON.parse(response.content);
          var now = new Date();
          summoner = {
            name: name,
            createdAt: now,
            refreshedAt: now,
            riotData: payload[name]
          };

          Summoners.insert(summoner);
          return summoner;
        } catch(e) {
          console.error(e);
          return null;
        }
      }
    },

    //https://na.api.pvp.net/api/lol/na/v2.5/league/by-summoner/22224/entry?api_key=d5a72743-9f89-4fd4-94d6-88cc37498658
    riotLeagueBySummonerEntry: function(summonerIds) {
      var apiUrl = "https://na.api.pvp.net/api/lol/na/v2.5/league/by-summoner/" + summonerIds.join(',') + "/entry";
      var response = HTTP.get(apiUrl, {
        params: {
          api_key: RIOT_API_KEY
        }
      });

      return EJSON.parse(response.content);
    },

    riotCurrentGame: function(summonerId) {
      var REFRESH_GAME_TIME = moment() - moment(10, "minutes");

      var currentGame = CurrentGames.findOne({
        summonerId: summonerId
      });

      if( currentGame && moment(currentGame.refreshedAt).isBefore(REFRESH_GAME_TIME) ){
        console.log("riotCurrentGame: Avoiding RiotAPI call, using cached data");
        return currentGame;
      } else {
        try{
          console.log("riotCurrentGame: Hitting RiotAPI");
          var response = HTTP.get("https://na.api.pvp.net/observer-mode/rest/consumer/getSpectatorGameInfo/NA1/" + summonerId, {
            params: {
              api_key: RIOT_API_KEY
            }
          });

          var payload = EJSON.parse(response.content);
          var now = new Date();
          currentGame = {
            summonerId: summonerId,
            createdAt: now,
            refreshedAt: now,
            riotData: payload
          };

          CurrentGames.insert(currentGame);
          return currentGame;
        } catch(e) {
          // No Current Game
          return null;
        }
      }
    },

    riotStaticDataChampion: function(championId) {
      this.unblock();
      return EJSON.parse(HTTP.get("https://global.api.pvp.net/api/lol/static-data/na/v1.2/champion/" + championId, {
        params: {
          api_key: RIOT_API_KEY,
          locale: "en_US",
          champData: "allytips,altimages,enemytips,image,info"
        }
      }).content);
    }
  });
}
