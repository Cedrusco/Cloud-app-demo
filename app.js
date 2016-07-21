/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var bodyParser = require('body-parser');
var request = require('request');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// Required for SSO
var passport = require('passport');
var OpenIDConnectStrategy = require('passport-idaas-openidconnect').IDaaSOIDCStrategy;

// create a new express server
var app = express();

// configure app to use SSO as auth middleware through passport 
app.use(cookieParser());
app.use(bodyParser());
app.use(session({resave: 'save', saveUninitialized: 'true', secret: 'mouse dog'}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

var services = JSON.parse(process.env.VCAP_SERVICES || "{}");
var ssoConfig = services.SingleSignOn[0];
var client_id = ssoConfig.credentials.clientId;
var client_secret = ssoConfig.credentials.secret;
var authorization_url = ssoConfig.credentials.authorizationEndpointUrl;
var token_url = ssoConfig.credentials.tokenEndpointUrl;
var issuer_url = ssoConfig.credentials.issuerIdentifier;
var callback_url = 'http://demo-app.ashrafinteractive-cloudscom-ashrafs-space.apic.mybluemix.net/auth/sso/callback';

var Strategy = new OpenIDConnectStrategy({
  authorizationURL: authorization_url,
  tokenURL: token_url,
  clientID: client_id,
  scope: 'openid',
  response_type: 'code',
  clientSecret: client_secret,
  callbackURL: callback_url,
  skipUserProfile: true,
  issuer: issuer_url},
  function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
      profile.accessToken = accessToken;
      profile.refreshToken= refreshToken;
      done(null, profile);
    });
});

passport.use(Strategy);

app.get('/login', passport.authenticate('openidconnect', {}));

function ensureAuthenticated(req, res, next) {
  if(!req.isAuthenticated()) {
    req.session.originalUrl = req.originalUrl;
    res.redirect('/login');
  } else {
    return next();
  }
}

app.get('/auth/sso/callback',function(req,res,next) {
  var redirect_url = req.session.originalUrl; passport.authenticate('openidconnect',{
  successRedirect: redirect_url,
  failureRedirect: '/failure', })(req,res,next);
});

var alchemy = services.alchemy_api[0];
var alchemy_url = alchemy.credentials.url;
var alchemy_api_key = alchemy.credentials.apikey;

app.get('/hello', ensureAuthenticated, function(req, res) { 
  // attach api key to url
  var url = alchemy_url + 
    '/text/TextGetTextSentiment?outputMode=jsoni&apikey=' + 
    alchemy_api_key;
  var text = 'This is a great text to test for sentiment analysis!';
  var options = {
    form: {
      text: text
    }
  };
  request.post(url, options).then(function(response) {
    var sentiment = response.body.docSentiment;
    res.send('text: ' + text + ' | Sentiment: ' + sentiment.type + ', ' + sentiment.score); 
  });

});

app.get('/failure', function(req, res) { 
  res.send('login failed'); 
});



// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});
