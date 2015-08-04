
// Stats for an individual summoner
var SummonerStats = new Mongo.Collection("summonerStats");

// Averages across all summoners
var AggregateSummonerStats = new Mongo.Collection("aggregateSummonerStats");

var STATS_CACHE_TIMEOUT = moment() - moment(7, "days");

if (Meteor.isServer){
  var Future = Npm.require("fibers/future");

  function addMatchToAggregateStats(matchData) {
    var participant = _.first(matchData.participants);

    // store stats by queue, league, role, lane
    var hash = [
      matchData.queueType, // RANKED_SOLO_5x5
      participant.highestAchievedSeasonTier, // MASTER
      matchData.timeline.role, // SOLO
      matchData.timeline.lane // MIDDLE
    ].join("|");

    console.log(hash);
  }

  var calculateSummonerStats = Meteor.wrapAsync(function(summonerId, onComplete) {
    Meteor.http.get("https://na.api.pvp.net/api/lol/na/v2.2/matchhistory/" + summonerId, {
      params: {
        api_key: RIOT_API_KEY
      }
    }, function(error, result) {
      console.log(result);
      onComplete(error, result);
    });
  });

  function summonerRecentStats(summonerIds) {
    var statQueryFutures = _.map(summonerIds, function(summonerId) {
      var future = new Future();

      var summonerStats = SummonerStats.findOne({
        summonerId: summonerId
      });

      if( summonerStats && moment(summonerStats.refreshedAt).isBefore(REFRESH_STATS_TIME) ){
        future.return(summonerStats);
      } else {
        calculateSummonerStats(summonerId, function(err, result){
          SummonerStats.insert(result);
          future.return(result);
        });
      }
      return future;
    });

    var result = _.map(statQueryFutures, function(future, i){
      return future.wait();
    });

    return result;
  }
    //
    //
    // try {
    //   var response = HTTP.get("https://na.api.pvp.net/api/lol/na/v2.2/matchhistory/" + summonerId, {
    //     params: {
    //       api_key: RIOT_API_KEY
    //     }
    //   });
    //
    //   var matches = EJSON.parse(response.content);
    //   var now = new Date();
    //
    //   _.each(matches, addMatchToAggregateStats);
    //
    //   var summonerStats = {
    //     summonerId: summonerId,
    //     createdAt: now,
    //     refreshedAt: now,
    //     riotData: matches
    //   };
    //
    //   SummonerStats.insert(summonerStats);
    //   return summonerStats;
    // } catch(e) {
    //   console.error(e);
    //   return null;
    // }

  Meteor.methods({
    summonerRecentStats: summonerRecentStats
  });
}
