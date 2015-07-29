
var Summoners = new Mongo.Collection("summoners");
var API_KEY = "d5a72743-9f89-4fd4-94d6-88cc37498658";

if (Meteor.isClient) {

  function checkCurrentGame() {
    Meteor.call("riotCurrentGame", name, function(error, results){
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
    var localSummoner = localStorage.getItem("localSummoner");
    if( !localSummoner ) {
      openSummonerNameDialog();
    } else {
      Session.set('localSummoner', JSON.parse(localSummoner));
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
    riotCurrentGame: function(platformId, summonerId) {

    }
  });
}
