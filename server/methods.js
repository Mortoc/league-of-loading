SECOND = 100; // ms
MINUTE = 60 * SECOND;
HOUR = 60 * MINUTE;
DAY = 24 * HOUR;

Meteor.methods({
  riotCurrentVersion: function() {
    this.unblock();
    return RiotAPI.currentVersion;
  },
  riotSummonerByName: function(name) {
    if( !_.isString(name) || !name.length ) throw new Meteor.Error(500, "Unexpected Type for argument name");
    this.unblock();
    return RiotAPI.summonerByName(name);
  },
  riotCurrentGame: function(summonerId) {
    if( !_.isNumber(summonerId) ) throw new Meteor.Error(500, "Unexpected Type for argument summonerId");
    this.unblock();
    return RiotAPI.currentGame(summonerId);
  },
  riotStaticDataChampion: function(championId) {
    if( !_.isNumber(championId) ) throw new Meteor.Error(500, "Unexpected Type for argument championId");
    this.unblock();
    return RiotAPI.championStaticData(championId);
  },
  riotStaticDataSpells: function() {
    this.unblock();
    return RiotAPI.spellStaticData();
  },
  riotLeagueBySummonerEntry: function(summonerIds) {
    if( !_.isArray(summonerIds) ) throw new Meteor.Error(500, "Unexpected Type for argument summonerIds");
    this.unblock();
    return RiotAPI.leagueBySummoners(summonerIds);
  },
  summonerRecentStats: function(summonerIds){
    if( !_.isArray(summonerIds) ) throw new Meteor.Error(500, "Unexpected Type for argument summonerIds");
    this.unblock();
    return summonerRecentStats(summonerIds);
  }
});
