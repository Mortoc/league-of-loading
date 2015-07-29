
var Summoners = new Mongo.Collection("summoners");
var CurrentGames = new Mongo.Collection("currentGames");

if (Meteor.isClient) {

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
        alert(error);
      } else if( response ) {
        Session.set('currentGame', response);
      } else {
        $('.not-in-game-text').fadeIn();
        $('.checking-game-indicator').hide();
      }
    });
  }

  function openSummonerNameDialog() {
    $('.summoner-name').val("");
    localStorage.removeItem("localSummoner");
    Session.set('localSummoner', null);
    $('.enter-summoner-name-modal').openModal();
    $('.summoner-name').focus();
  }

  function setSummonerName() {
    var name = $('.summoner-name').val();

    Meteor.call("riotSummonerByName", name, function(error, results){
      $('.enter-summoner-name-modal').closeModal();

      if( error ) {
        alert(error);
      } else {
        if( !results ) {
          alert("Summoner name not found");
          openSummonerNameDialog();
        } else {
          localStorage.setItem("localSummoner", JSON.stringify(results));
          Session.set('localSummoner', results);
          checkCurrentGame();
        }
      }
    });
  }

  Meteor.startup(function(){
    $('.parallax').parallax();
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
    }
  });

  Template.body.events({
    'keypress input.summoner-name': function (evt, template) {
      if (evt.which === 13) {
        setSummonerName();
      }
    },
    'click .load-summoner': setSummonerName,
    'click .refresh-current-game': checkCurrentGame,
    'click .change-summoner': openSummonerNameDialog,
  });
}

if (Meteor.isServer){
  // Needs to be changed to an env variable
  var API_KEY = "d5a72743-9f89-4fd4-94d6-88cc37498658";

  Meteor.methods({
    riotSummonerByName: function(name) {
      var REFRESH_SUMMONER_TIME = moment() - moment(12, "hours");
      name = name.toLowerCase();

      var summoner = Summoners.findOne({
        name: name
      });

      if( summoner && moment(summoner.refreshedAt).isAfter(REFRESH_SUMMONER_TIME) ){
        return summoner;
      } else {
        try{
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
          return null;
        }
      }
    },
    riotCurrentGame: function(summonerId) {
      var REFRESH_GAME_TIME = moment() - moment(10, "minutes");

      var currentGame = CurrentGames.findOne({
        summonerId: summonerId
      });

      if( currentGame && moment(currentGame.refreshedAt).isAfter(REFRESH_GAME_TIME) ){
        return currentGame;
      } else {
        try{
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
          return null;
        }
      }
    }
  });
}
