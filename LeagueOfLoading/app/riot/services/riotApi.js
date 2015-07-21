angular.module('riot').factory('riotApi', function ($resource, baseUrl, apikey) {
    var summoner = $resource(baseUrl, {
        api_key: apikey
    }, {
        summoner: {
            method: "get",
            url: baseUrl + "api/lol/na/v1.4/summoner/by-name/:summonerNames",
        },
        currentGame: {
            method: "get",
            url: baseUrl + "observer-mode/rest/consumer/getSpectatorGameInfo/NA1/:summonerId",
        }
    });

    return summoner;
});
