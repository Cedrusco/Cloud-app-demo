/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var path = require('path');
var fs = require('fs');
var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var bodyParser = require('body-parser');
var request = require('request');
var DCClient = require('./dcclient.js');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// Required for SSO
var passport = require('passport');
var OpenIDConnectStrategy = require('passport-idaas-openidconnect').IDaaSOIDCStrategy;

// create a new express server
var app = express();

// configure app to use SSO as auth middleware through passport 
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({resave: 'save', saveUninitialized: 'true', secret: 'mouse dog'}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});
var services;
if(process.env.LOCAL_NODE_ENV) {
  var filePath = path.join(__dirname, 'local-service-config.json');
  services = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
} else {
  services = JSON.parse(process.env.VCAP_SERVICES || "{}");
}

var ssoConfig = services.SingleSignOn[0];
var client_id = ssoConfig.credentials.clientId;
var client_secret = ssoConfig.credentials.secret;
var authorization_url = ssoConfig.credentials.authorizationEndpointUrl;
var token_url = ssoConfig.credentials.tokenEndpointUrl;
var issuer_url = ssoConfig.credentials.issuerIdentifier;
var callback_url = 'http://demo-app.ashrafinteractive-cloudscom-ashrafs-space.apic.mybluemix.net/auth/sso/callback';

// Data cache
if ( services &&
     services['DataCache'] &&
     services['DataCache'][0] &&
     services['DataCache'][0].credentials ) {
  // Create the DataCache client
  console.log('has datacache attributes');
  app.locals.dcClt = new DCClient(services['DataCache'][0].credentials);
}

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

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/bower_components'));

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

app.use(require('./api/gmail.js'));

app.get('/set', function(req, res) {
  var query = req.query;
  var dcClt = req.app.locals.dcClt;
  dcClt.put(null, query.key, {'myobj': 'myvalue'}, 'application/json', function(err) {
    if(err) res.status(500).send(err);
    else {
      res.send('success');
    }
  });
});
app.get('/get', function(req, res) {
  var dcClt = req.app.locals.dcClt;
  var query = req.query;
  console.log(query);
  dcClt.get(null, query.key, function(result) {
    if(result.status == 404) {
      res.send('Object not found'); 
    } else {
      var obj = JSON.parse(result.responseText);
      res.send('success: ' + result.responseText);
    }
  });
});

app.use(ensureAuthenticated);
app.get('/hello', function(req, res) { 
  console.log('colin user:', req.user);
  // attach api key to url
  var url = alchemy_url + 
    '/text/TextGetTextSentiment?outputMode=json&apikey=' + 
    alchemy_api_key;
  var text = 'This is a great text to test for sentiment analysis!';
  var options = {
    form: {
      text: text
    },
    json: true
  };
  res.redirect('/dashboard');
});

app.get('/failure', function(req, res) { 
  res.send('login failed'); 
});


app.get('/*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});


// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});
