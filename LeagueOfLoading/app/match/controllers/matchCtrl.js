angular.module('leagueOfLoading').controller('MatchCtrl', function ($scope, riotApi) {
    
    riotApi.summoner({ summonerNames: ['TheMortoc'] }).$promise.then(function (summonerResponse) {
        var summoner = summonerResponse['TheMortoc'.toLowerCase()];
        $scope.summonerInfo = summoner;

        if (summoner) {
            riotApi.currentGame({ summonerId: summoner.id }).$promise.then(function (currentGameResponse) {
                console.log(currentGameResponse);
            });
        }
    });
});
