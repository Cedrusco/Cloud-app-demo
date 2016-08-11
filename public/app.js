// TODO put each angular component in a separate file
// DONT TRY THIS AT HOME!

var app = angular.module('demo-app', ['ngMaterial', 'ui.router']);

app.controller('main', ['$scope', function($scope) {
  $scope.checkWorking = 'This app is working!';
}]).controller('dashboardController', ['$scope', 'messages', function($scope, messages) {
  console.log('messages', messages)
  $scope.messages = messages.data;
  $scope.messages.forEach(function(message) {
    message.sentiment.score = message.sentiment.score || 0; 
  });
}])
.config(function($urlRouterProvider, $locationProvider, $stateProvider, $mdThemingProvider) {

  $urlRouterProvider.otherwise("/home");

  $locationProvider.html5Mode(true);

  $stateProvider.state('home', {
    url: '/home',
    templateUrl: '/templates/home.html'
  })
  .state('dashboard', {
    url: '/dashboard',
    templateUrl: '/templates/dashboard.html',
    controller: 'dashboardController',
    resolve: {
      messages: function($http) {
        return $http.get('/emails');
      }
    }
  });

});
