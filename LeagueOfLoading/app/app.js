angular.module('riot', ['ngResource']);
angular.module('leagueOfLoading', ['ui.router', 'ngAnimate', 'compiledTemplates', 'riot']);

angular.module('leagueOfLoading').config(function ($stateProvider, $urlRouterProvider) {

    $stateProvider.state('match', {
        url: '/match',
        templateUrl: 'app/match/pages/match.html'
    });

    $urlRouterProvider.otherwise('/match');
});
