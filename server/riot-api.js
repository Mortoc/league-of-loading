var RiotAPICache = new Mongo.Collection("riotCache");

var Summoners = new Mongo.Collection("summoners");
var CurrentGames = new Mongo.Collection("currentGames");
var RiotApiCallRecords = new Mongo.Collection("riotApiCallRecords");

var Future = Npm.require("fibers/future");

var RIOT = {
  KEY: "d5a72743-9f89-4fd4-94d6-88cc37498658",
  CALL_LIMITS: [
    { PEROID: 10 * SECOND, LIMIT: 10 },
    { PEROID: 10 * MINUTE, LIMIT: 500 }
  ],
  CURRENT_VERSION: {
    URL: "https://global.api.pvp.net/api/lol/static-data/na/v1.2/versions"
  },
  SUMMONER_BY_NAME: {
    URL: "https://na.api.pvp.net/api/lol/na/v1.4/summoner/by-name/{0}",
    CACHE_TIMEOUT: 12 * HOUR
  },
  LEAGUE_BY_SUMMONER: {
    URL: "https://na.api.pvp.net/api/lol/na/v2.5/league/by-summoner/{0}/entry"
  },
  CURRENT_GAME: {
    URL: "https://na.api.pvp.net/observer-mode/rest/consumer/getSpectatorGameInfo/{0}/{1}",
    CACHE_TIMEOUT: 10 * MINUTE
  },
  CHAMPION_DATA: {
    URL: "https://global.api.pvp.net/api/lol/static-data/na/v1.2/champion/{0}",
    EXTRA_PARAMS: {
      locale: "en_US",
      champData: "allytips,altimages,enemytips,image,info"
    }
  },
  SPELL_DATA: {
    URL: "https://global.api.pvp.net/api/lol/static-data/na/v1.2/summoner-spell",
    EXTRA_PARAMS: {
      spellData: "all"
    }
  }
};

function hasTimeoutLapsed(refreshTime, cacheTimeout) {
  var cacheExpireTime = new Date().getTime() - cacheTimeout;
  return refreshTime < cacheExpireTime;
}

makeRiotApiCall = function(url, options) {
  var _options = _.extend({
    cacheTimeout: null,
    transformResponse: null,
    errorHandler: function(status){ }
  }, options);

  var future = new Future();
  var usedCache = false;

  // Check if the cached model is sufficient
  if( _options.cacheTimeout ) {
    var model = RiotAPICache.findOne({ url: url });

    if( model ) {
      if( hasTimeoutLapsed(model.refreshedAt, _options.cacheTimeout) ) {
        RiotAPICache.remove(model);
      } else {
        future.return(model.data);
        usedCache = true;
      }
    }
  }

  // If the cached model wasn't used, do the external query and cache the result
  if( !usedCache ) {
    //console.log("Calling RIOT API", url);
    Meteor.http.get(url, {params: { api_key: RIOT.KEY }}, function(error, result) {
      if(error) {
        console.log("Handling an error code: ", error.response.statusCode);
        var errorHandleResult = _options.errorHandler(error.response.statusCode);
        if( !_.isUndefined(errorHandleResult) ) {
          future.return(errorHandleResult);
          return;
        } else {
          throw new Meteor.Error("Error handler did not rescue the failed API call {0}".format(url));
        }
      }

      var resultData = result.data;

      if( _options.cacheTimeout ) {
        var now = new Date().getTime();
        RiotAPICache.insert({
          url: url,
          refreshedAt: now,
          data: resultData
        });
      }

      future.return(resultData);
    });
  }

  var result = future.wait();
  if( _.isFunction(_options.transformResponse) ) {
    result = _options.transformResponse(result);
  }
  return result;
};

RiotAPI = {
  currentVersion: null,
  summonerByName: function(summonerName) {
    var formattedName = summonerName.toLowerCase().replace(/\s/g, '');

    console.log("summonerByName", formattedName);

    return makeRiotApiCall( RIOT.SUMMONER_BY_NAME.URL.format(formattedName), {
      cacheTimeout: RIOT.SUMMONER_BY_NAME.CACHE_TIMEOUT,
      transformResponse: function(responseContent) {
        var summonerData = responseContent[formattedName];
        summonerData.summonerId = summonerData.id;
        return summonerData;
      },
      errorHandler: function(status) {
        if(status == 404){
          return "NotFound";
        }
      }
    });
  },
  leagueBySummoners: function(summonerIds) {
    if( !_.isArray(summonerIds) || summonerIds.length > 10 ) {
      throw new Meteor.Error(500, "summonerIds must be an array of length < 10");
    }
    return makeRiotApiCall(RIOT.LEAGUE_BY_SUMMONER.URL.format(summonerIds.join(',')));
  },
  currentGame: function(summonerId) {
    return makeRiotApiCall(RIOT.CURRENT_GAME.URL.format("NA1", summonerId), {
      cacheTimeout: RIOT.CURRENT_GAME.CACHE_TIMEOUT,
      errorHandler: function(status){
        if( status == 404 ) {
          return "NoCurrentGame";
        }
      }
    });
  },
  championStaticData: function(championId) {
    // Static data does not count against the API limits
    return HTTP.get(RIOT.CHAMPION_DATA.URL.format(championId), {
      params: _.extend({
        api_key: RIOT.KEY,
      }, RIOT.CHAMPION_DATA.EXTRA_PARAMS)
    }).data;
  },
  spellStaticData: function() {
    return HTTP.get(RIOT.SPELL_DATA.URL, {
      params: _.extend({
        api_key: RIOT.KEY
      }, RIOT.SPELL_DATA.EXTRA_PARAMS)
    }).data;
  }
};

function updateCurrentVersion() {
  // Static data does not count against the API limits
  var response = HTTP.get(RIOT.CURRENT_VERSION.URL, {
    params: {
      api_key: RIOT.KEY
    }
  });
  RiotAPI.currentVersion = _.first(EJSON.parse(response.content));
  console.log("Using League of Legends Version", RiotAPI.currentVersion);
}

Meteor.startup(function(){
  updateCurrentVersion();
  // update the version once a day
  Meteor.setTimeout(updateCurrentVersion, DAY);
});
