
// Averages across all summoners
var AggregateSummonerStats = new Mongo.Collection("aggregateSummonerStats");
// keep track of which games are in the aggregate stats
var AggregatedSummonerGames = new Mongo.Collection("aggregatedSummonerGames");

var STATS_URL = "https://na.api.pvp.net/api/lol/na/v2.2/matchhistory/{0}";
var STATS_CACHE_TIMEOUT = 1 * DAY;

var NORMALIZE_STATS_FOR_MATCH_LENGTH = {
  unrealKills: true,
  totalDamageTaken: true,
  pentaKills: true,
  sightWardsBoughtInGame: true,
  winner: false,
  magicDamageDealt: true,
  wardsKilled: true,
  largestCriticalStrike: false,
  trueDamageDealt: true,
  doubleKills: true,
  physicalDamageDealt: true,
  tripleKills: true,
  deaths: true,
  firstBloodAssist: false,
  magicDamageDealtToChampions: true,
  assists: true,
  visionWardsBoughtInGame: true,
  totalTimeCrowdControlDealt: true,
  champLevel: false,
  physicalDamageTaken: true,
  totalDamageDealt: true,
  largestKillingSpree: false,
  inhibitorKills: true,
  minionsKilled: true,
  towerKills: true,
  physicalDamageDealtToChampions: true,
  quadraKills: true,
  goldSpent: true,
  totalDamageDealtToChampions: true,
  goldEarned: true,
  neutralMinionsKilledTeamJungle: true,
  firstBloodKill: false,
  firstTowerKill: false,
  wardsPlaced: true,
  trueDamageDealtToChampions: true,
  killingSprees: true,
  firstInhibitorKill: false,
  totalScoreRank: false,
  totalUnitsHealed: true,
  kills: true,
  firstInhibitorAssist: false,
  totalPlayerScore: false,
  neutralMinionsKilledEnemyJungle: true,
  magicDamageTaken: true,
  largestMultiKill: false,
  totalHeal: true,
  objectivePlayerScore: false,
  firstTowerAssist: false,
  trueDamageTaken: true,
  neutralMinionsKilled: true,
  combatPlayerScore: false
};

function getStatNormalizedValue(participantStats, matchDuration, statName) {
  // convert match duration to per minute for human-readability
  matchDuration /= 60;

  var statValue = participantStats[statName]|0;

  if( NORMALIZE_STATS_FOR_MATCH_LENGTH[statName] ) {
    statValue /= matchDuration;
  }

  return statValue;
}

function matchToStatGroup(matchData) {
  var participant = _.first(matchData.participants);

  // store stats by queue, league, role, lane
  return [
    matchData.queueType, // RANKED_SOLO_5x5
    participant.highestAchievedSeasonTier, // MASTER
    participant.timeline.role, // SOLO
    participant.timeline.lane // MIDDLE
  ].join("|");
}

function addStats(existingStats, matchDuration, newStats) {
  _.each(_.keys(newStats), function(statName){
    // don't track stats on item ids
    if( !statName.startsWith("item") ) {
      if( _.isUndefined(existingStats[statName]) ) {
        existingStats[statName] = 0;
      }

      existingStats[statName] += getStatNormalizedValue(newStats, matchDuration, statName);
    }
  });
}

function aggregateEntryExists(match) {
  if( match.participantIdentities.length > 1 ) {
    console.warn("unexpected data, multiple participants returned from Riot");
  }

  var matchIdentity = {
    summonerId: _.first(match.participantIdentities).player.summonerId,
    matchId: match.matchId
  };

  if( !matchIdentity.summonerId ) {
    throw new Meteor.Error(500, "Cannot find summonerId for matchIdentity");
  }

  if( !matchIdentity.matchId ) {
    throw new Meteor.Error(500, "Cannot find matchId for matchIdentity");
  }

  if( AggregatedSummonerGames.findOne(matchIdentity) ) {
    return true;
  } else {
    AggregatedSummonerGames.insert(matchIdentity);
    return false;
  }
}

function addMatchToAggregateStats(matchData) {
  if( matchData.participants.length > 1 ) {
    console.warn("unexpected data, multiple participants returned from Riot");
  }

  var participant = _.first(matchData.participants);
  var group = matchToStatGroup(matchData);

  if( !participant ) {
    throw Meteor.Error(500, "Match has no participants " + matchData.matchId);
  }
  if( !group ) {
    throw Meteor.Error(500, "Unable to build match name from match data for match " + matchData.matchId);
  }

  if( !aggregateEntryExists(matchData) ) {
    var aggregateStats = AggregateSummonerStats.findOne({
      grouping: group
    });

    if( !aggregateStats ) {
      aggregateStats = {
        grouping: group,
        stats: {},
        denominator: 0
      };
    } else {
      AggregateSummonerStats.remove({
        grouping: group
      });
    }

    addStats(aggregateStats.stats, matchData.matchDuration, participant.stats);
    aggregateStats.denominator++;

    AggregateSummonerStats.insert(aggregateStats);
  }
}

function getSummonerPerformance(matches) {
  var roleCounts = {};
  var totalPerformance = _.reduce(matches, function(memo, match){
    var participant = _.first(match.participants);
    var laneAndRole = participant.timeline.role + " " + participant.timeline.lane;
    if( !roleCounts[laneAndRole] ) {
      roleCounts[laneAndRole] = 1;
    } else {
      roleCounts[laneAndRole]++;
    }
    var statGroup = matchToStatGroup(match);
    var aggregateStats = AggregateSummonerStats.findOne({grouping: statGroup});

    if( !aggregateStats ) {
      throw new Meteor.Error(500, "InternalError: No stat averages found for " + statGroup);
    }

    _.each(_.keys(participant.stats), function(statName){
      var summonerStatValue = getStatNormalizedValue(participant.stats, match.matchDuration, statName);

      if( !statName.startsWith("item") ) {
        var avgStatValue = aggregateStats.stats[statName] / aggregateStats.denominator;

        if( _.isUndefined(memo[statName]) ) {
          memo[statName] = 0;
        }

        if( Math.abs(avgStatValue) < 0.0001 ) {
          memo[statName] += 1.0;
        } else {
          memo[statName] += summonerStatValue / avgStatValue;
        }
      }
    });

    return memo;
  }, {});

  _.each(_.keys(totalPerformance), function(stat){
    totalPerformance[stat] /= matches.length;
  });

  var highestRole = null;
  var highestRoleCount = 0;
  _.each(_.keys(roleCounts), function(role) {
    var count = roleCounts[role];
    if( count > highestRoleCount ) {
      highestRole = role;
      highestRoleCount = count;
    }
  });

  totalPerformance.mostCommonRole = highestRole;

  return totalPerformance;
}

function calculateSummonerStats(recentMatches) {
  _.each(recentMatches.matches, addMatchToAggregateStats);
  return getSummonerPerformance(recentMatches.matches);
}

summonerRecentStats = function(summonerIds) {
  return _.reduce(summonerIds, function(memo, summonerId) {
    var summonerStats = makeRiotApiCall(STATS_URL.format(summonerId), {
      cacheTimeout: STATS_CACHE_TIMEOUT,
      transformResponse: calculateSummonerStats
    });
    memo[summonerId] = summonerStats;
    return memo;
  }, {});

  Meteor.startup(function(){
    AggregateSummonerStats._ensureIndex({grouping: 1});
    AggregatedSummonerGames._ensureIndex({summonerId: 1, matchId: 1});
  });
};
