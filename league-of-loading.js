
var Summoners = new Mongo.Collection("summoners");
var CurrentGames = new Mongo.Collection("currentGames");

if (Meteor.isClient) {

  function updateCurrentGame(currentGame) {
    Session.set('currentGame', currentGame);
    $('.collapsible').collapsible({
      accordion: false
    });
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
          champResponse.image.full = "http://ddragon.leagueoflegends.com/cdn/5.2.1/img/champion/" + champResponse.image.full;
          console.log(champResponse);
          participant.championInfo = champResponse;
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

  var isCheckingCurrentGame = false;
  function checkCurrentGame() {
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
  }

  function openSummonerNameDialog() {
    $('.summoner-name').val("");
    $('.not-in-game-text').hide();
    localStorage.removeItem("localSummoner");
    Session.set('localSummoner', null);
    Session.set('currentGame', null);
    $('.enter-summoner-name-modal').openModal();
    $('.summoner-name').focus();
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
          openSummonerNameDialog();
        } else {
          console.log(results);
          localStorage.setItem("localSummoner", JSON.stringify(results));
          Session.set('localSummoner', results);
          checkCurrentGame();
        }
      }
    });
  }

  Meteor.startup(function(){
    $(".button-collapse").sideNav();
    $('.checking-game-indicator').hide();
    var localSummoner = localStorage.getItem("localSummoner");
    if( !localSummoner ) {
      openSummonerNameDialog();
    } else {
      Session.set('localSummoner', JSON.parse(localSummoner));
      checkCurrentGame();
    }
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
    'click .change-summoner': openSummonerNameDialog,
  });
}

if (Meteor.isServer){
  // Needs to be changed to an env variable
  var API_KEY = "d5a72743-9f89-4fd4-94d6-88cc37498658";

  Meteor.methods({
    riotSummonerByName: function(name) {
      var REFRESH_SUMMONER_TIME = moment() - moment(12, "hours");
      name = name.toLowerCase().replace(" ", "");

      var summoner = Summoners.findOne({
        name: name
      });

      if( false && summoner && moment(summoner.refreshedAt).isBefore(REFRESH_SUMMONER_TIME) ){
        console.log("riotSummonerByName: Avoiding RiotAPI call, using cached data");
        return summoner;
      } else {
        try{
          console.log("riotSummonerByName: Hitting RiotAPI");
          var response = HTTP.get("https://na.api.pvp.net/api/lol/na/v1.4/summoner/by-name/" + name, {
            params: {
              api_key: API_KEY
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
      console.log(apiUrl);
      var response = HTTP.get(apiUrl, {
        params: {
          api_key: API_KEY
        }
      });
      console.log(response);
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
              api_key: API_KEY
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
          console.error(e);
          return null;
        }
      }
    },

    riotStaticDataChampion: function(championId) {
      return EJSON.parse(HTTP.get("https://global.api.pvp.net/api/lol/static-data/na/v1.2/champion/" + championId, {
        params: {
          api_key: API_KEY,
          locale: "en_US",
          champData: "allytips,altimages,enemytips,image,info"
        }
      }).content);
    }
  });
}
