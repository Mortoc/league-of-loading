
var Summoners = new Mongo.Collection("summoners");
var API_KEY = "d5a72743-9f89-4fd4-94d6-88cc37498658";

if (Meteor.isClient) {
  Meteor.startup(function(){
    $('.progress').hide();

    // if we don't have a summoner name saved
    $('.enter-summoner-name-modal').openModal();
  });
  Template.body.events({
    'click .load-summoner': function (event) {
      var name = $('.summoner-name').val();
      $('.progress').show();
      $('.load-summoner').hide();

      Meteor.call("riotSummonerByName", name, function(error, results){
        console.log(results);
        $('.progress').hide();
        $('.load-summoner').show();
        $('.enter-summoner-name-modal').hide();
      });
    }
  });
}

if (Meteor.isServer) {
  Meteor.methods({
    riotSummonerByName: function(name) {
      name = name.toLowerCase();

      var summoner = Summoners.findOne({
        name: name
      });

      if( !summoner ) {
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
      }

      return summoner;
    }
  });
}
