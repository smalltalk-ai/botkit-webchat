const HTTP = require('http');
const socketIO = require('socket.io');
const Botkit = require('botkit');

var WebchatIObot = function(configuration) {
  // Create a core botkit bot
  var webchatio_botkit = Botkit.core(configuration || {});

  webchatio_botkit.excludeFromConversations(['message_delivered', 'message_echo', 'message_read']);

  // format the platform_message into webchat/facebook format
  webchatio_botkit.middleware.format.use(function(bot, message, platform_message, next) {

      platform_message.recipient = {};
      platform_message.message =  message.sender_action ? undefined : {};

      platform_message.recipient.id = message.channel;

      if (!message.sender_action) {
          if (message.text) {
              platform_message.message.text = message.text;
          }

          if (message.attachment) {
              platform_message.message.attachment = message.attachment;
          }

          if (message.tag) {
              platform_message.message.tag = message.tag;
          }

          if (message.sticker_id) {
              platform_message.message.sticker_id = message.sticker_id;
          }

          if (message.quick_replies) {

              // sanitize the length of the title to maximum of 20 chars
              var titleLimit = function(title) {
                  if (title.length > 20) {
                      var newTitle = title.substring(0, 16) + '...';
                      return newTitle;
                  } else {
                      return title;
                  }
              };

              platform_message.message.quick_replies = message.quick_replies.map(function(item) {
                  var quick_reply = {};
                  if (item.content_type === 'text' || !item.content_type) {
                      quick_reply = {
                          content_type: 'text',
                          title: titleLimit(item.title),
                          payload: item.payload,
                          image_url: item.image_url,
                      };
                  } else if (item.content_type === 'location') {
                      quick_reply = {
                          content_type: 'location'
                      };
                  } else {
                      // Future quick replies types
                  }
                  return quick_reply;
              });
          }
      } else {
          platform_message.sender_action = message.sender_action;
      }

      if (message.sender_action) {
          platform_message.sender_action = message.sender_action;
      }

      if (message.notification_type) {
          platform_message.notification_type = message.notification_type;
      }

      next();
  });

  // customize the bot definition, which will be used when new connections
  // spawn!
  webchatio_botkit.defineBot(function(botkit, config) {
    var bot = {
      type: 'webchat-io',
      botkit: botkit,
      config: config || {},
      utterances: botkit.utterances,
      io: null
    };

    // send message using socket.io
    bot.send = function(message, cb) {
      let socket = webchatio_botkit.io.sockets.connected[message.recipient.id];

      socket.emit(message);
      if (err) {
        botkit.debug('SOCKET.IO ERROR', err);
        return cb && cb(err);
      }
      //botkit.debug('SOCKET.IO SUCCESS');
      botkit.debug('SOCKET.IO - not implemented');
      cb && cb(null, body);
    };

    bot.startTyping = function(src, cb) {
      var msg = {};
      msg.channel = src.channel;
      msg.sender_action = 'typing_on';
      bot.say(msg, cb);
    };

    bot.stopTyping = function(src, cb) {
      var msg = {};
      msg.channel = src.channel;
      msg.sender_action = 'typing_off';
      bot.say(msg, cb);
    };

    bot.replyWithTyping = function(src, resp, cb) {
      var textLength;

      if (typeof(resp) == 'string') {
        textLength = resp.length;
      } else if (resp.text) {
        textLength = resp.text.length;
      } else {
        textLength = 80; //default attachement text length
      }

      var avgWPM = 85;
      var avgCPM = avgWPM * 7;

      var typingLength = Math.min(Math.floor(textLength / (avgCPM / 60)) * 1000, 5000);

      bot.startTyping(src, function(err) {
        if (err) console.log(err);
        setTimeout(function() {
          bot.reply(src, resp, cb);
        }, typingLength);
      });
    };

    bot.reply = function(src, resp, cb) {
      var msg = {};

      if (typeof(resp) == 'string') {
        msg.text = resp;
      } else {
        msg = resp;
      }

      msg.channel = src.channel;
      msg.to = src.user;

      // queues the message in botkit
      bot.say(msg, cb);
    };

    bot.findConversation = function(message, cb) {
      botkit.debug('CUSTOM FIND CONVO', message.user, message.channel);
      for (var t = 0; t < botkit.tasks.length; t++) {
        for (var c = 0; c < botkit.tasks[t].convos.length; c++) {
          if (
            botkit.tasks[t].convos[c].isActive() &&
            botkit.tasks[t].convos[c].source_message.user == message.user
          ) {
            botkit.debug('FOUND EXISTING CONVO!');
            cb(botkit.tasks[t].convos[c]);
            return;
          }
        }
      }

      cb();
    };

    // return info about the specific instance of this bot
    // including identity information, and any other info that is relevant
    bot.getInstanceInfo = function(cb) {
      return webchatio_botkit.getInstanceInfo(cb);
    };

  });

  // TODO: Josh/Patrick - do we need this?
  // return info about the specific instance of this bot
  // including identity information, and any other info that is relevant
  // unlike other platforms, this has to live on the controller
  // so that we can use it before a bot is spawned!
  webchatio_botkit.getInstanceInfo = function(cb) {
    return new Promise(function(resolve, reject) {
      var instance = {
        identity: {},
        team: {},
      };

      request.get('https://' + api_host + '/v2.6/me?access_token=' + configuration.access_token,
              {},
              function(err, res, body) {
                  if (err) {
                      if (cb) cb(err);
                      return reject(err);
                  } else {

                      var identity = null;
                      try {
                          identity = JSON.parse(body);
                      } catch (err) {
                          if (cb) cb(err);
                          return reject(err);
                      }

                      // for facebook, the bot and the page have the same identity
                      instance.identity.name = identity.name;
                      instance.identity.id = identity.id;

                      instance.team.name = identity.name;
                      instance.team.url = 'http://facebook.com/' + identity.id;
                      instance.team.id = identity.id;

                      if (cb) cb(null, instance);
                      resolve(instance);
                  }
              });
    });
  };

  // set up a web route for receiving outgoing webhooks and/or slash commands
  webchatio_botkit.createWebhookEndpoints = function(webserver, bot, cb) {

    var server = HTTP.Server(webserver);
    var io = socketIO(server);
    server.listen(webchatio_botkit.config.port);

    webchatio_botkit.io = io;
    webchatio_botkit.handleSocketPayload(bot);

    webchatio_botkit.log(
      '** Serving socket.io endpoints for Webchat.io Platform on: ' +
      'http://' + webchatio_botkit.config.hostname + ':' + webchatio_botkit.config.port);

    if (cb) {
      cb();
    }

    return webchatio_botkit;
  };

  webchatio_botkit.handleSocketPayload = function(bot) {

    webchatio_botkit.io.on('connection', function(socket){
      socket.emit({ hello: 'world' });
      console.log('****** hit');
      // capture user
      socket.on('messages', function (data) {
        webchatio_botkit.ingest(bot, message, socket);
      });
      socket.on('messaging_postbacks ', function (data) {
        webchatio_botkit.ingest(bot, message, socket);
      });
      webchatio_botkit.handleSocketPayload(socket, bot);
    });
  };

  webchatio_botkit.middleware.spawn.use(function(worker, next) {

    // copy the identity that we get when the app initially boots up
    // into the specific bot instance
    worker.identity = webchatio_botkit.identity;
    next();

  });


  webchatio_botkit.startTicking();

  return webchatio_botkit;

};

module.exports = WebchatIObot;
