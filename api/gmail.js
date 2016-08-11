var router = require('express').Router();
var request = require('request');
var Promise = require('bluebird');
var google = require('./../gmail-api.js');
var gmail = google.gmailAPI;
var authorize = google.authorize;
var services = JSON.parse(process.env.VCAP_SERVICES || "{}");
var alchemy = services.alchemy_api[0];
var alchemy_url = alchemy.credentials.url;
var alchemy_api_key = alchemy.credentials.apikey;


var getFullMessages = function(dataCache) {
  // Promise chain uses both callbacks and promises
  // TODO remove wrap all callback based functions in a promise and save 
  //      in a function wrapper to clean up code
  /* DONT TRY THIS AT HOME */
  return (new Promise(function(resolve, reject) {
    authorize(function(auth) {
      return gmail.users.messages.list({
        'auth': auth,
        'userId': 'me',
        'maxResults': 10,
        'q': 'label:test'
      }, function(err, resp) {
        if(err) {
          reject(err);
        } else {
          resolve(resp); 
        }
      }); 
    });
  }))
  .then(function(result) {
    return (new Promise(function(resolve, reject) {
      dataCache.get(null, 'emails', function(emailsResult) {
        if(emailsResult.status == 404) 
          return resolve(result); 
        {}
        if(!emailsResult.responseText) {
          return reject(emailsResult); 
        }
        var emailMessages = JSON.parse(emailsResult.responseText);
        result.messages.forEach(function(message, i) {
          var email = emailMessages[message.id];
          if(email) {
            result.messages[i] = email;
          }
        });
        resolve(result);
      });
    }));
  })
  .then(function(result) {
    return Promise.map(result.messages, function(message) {
      if(!message.sentiment) {
        return (new Promise(function(resolve, reject) {
          authorize(function(auth) {
            return gmail.users.messages.get({
              'auth': auth,
              'userId': 'me',
              'id': message.id
            }, function(err, resp) {
              if(err) {
                reject(err);
              } else {
                var msgBody;
                if(resp.payload.parts) {
                  resp.payload.parts.forEach(function(part) {
                    if(part.mimeType === 'text/plain') {
                      msgBody = (new Buffer(part.body.data, 'base64')).toString(); 
                    }
                  });
                } else {
                  if(resp.payload && resp.payload.body && resp.payload.body.data) {
                    msgBody = (new Buffer(resp.payload.body.data, 'base64')).toString(); 
                  } else {
                    msgBody = resp.snippet;
                  }
                }
                var filteredMsg = resp.payload.headers.filter(function(header) {
                  var hName = header.name;
                  var conditions = hName === 'Subject' || 
                                   hName === 'Date' ||
                                   hName === 'From';
                  return conditions;
                }).reduce(function(obj, elem) {
                  obj[elem.name] = elem.value;
                  return obj;
                }, {});
                var url = alchemy_url + 
                '/text/TextGetTextSentiment?outputMode=json&apikey=' + 
                alchemy_api_key;
                filteredMsg.snippet = resp.snippet;
                var options = {
                form: {
                 text: msgBody || resp.snippet || "No content"
                },
                json: true
                };
                // Clean up use of promise constructer and callbacks. pick one!
                request.post(url, options, function(err, response) {
                  if(err) {
                    reject(err);
                  } else {
                    // This should happen in a .then()
                    console.log('this is a response', response.body);
                    filteredMsg.sentiment = response.body.docSentiment; 
                    //filteredMsg.msgBody = msgBody; 
                    filteredMsg.sentiment.score = Number(filteredMsg.sentiment.score);
                    console.log('filtered message', response.body);
                    resolve(filteredMsg); 
                  }
                }); 
              }
            }); 
          });
        })); 
      }
    });
  })
  .then(function(filteredMessages) {
    dataCache.put(null, 'emails', filteredMessages, 'application/json', function(err) {
      if(err) {
        console.log('dataCache put error:', err); 
      }
    });
    return filteredMessages;
  });
};
  
router.get('/emails', function(req, res) {
    var dcClt = req.app.locals.dcClt;
    console.log('req.app.locals.cdClt', dcClt);
    getFullMessages(dcClt).then(function(messageArray) {
      console.log('messageArray', messageArray);
      res.json(messageArray); 
    }); 
  });

module.exports = router;
