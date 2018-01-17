const Botkit = require('botkit');

const
  RECEIVE_URL = '/webchat-io/receive',
  THREAD_SETTING_URL = '/webchat-io/thread-setting'
;

var WebchatIObot = function(configuration) {
  // Create a core botkit bot
  var webchatio_botkit = Botkit.core(configuration || {});

  // if socket.io allows race conditions for delivery
  // - meaning that images is sent first, then text message
  // - but text message shows first, since it takes less time to send
  // then need to support option config.require_delivery, which
  // promises that messages are shown in the order they are sent
  if (webchat_botkit.config.require_delivery) {
  }

  // TODO: Josh/Patrick format the message for webchat
  webchatio_botkit.middleware.format.use(function(bot, message, platform_message, next) {

      platform_message.recipient = {};
      platform_message.message =  message.sender_action ? undefined : {};

      if (typeof(message.channel) == 'string' && message.channel.match(/\+\d+\(\d\d\d\)\d\d\d\-\d\d\d\d/)) {
          platform_message.recipient.phone_number = message.channel;
      } else {
          platform_message.recipient.id = message.channel;
      }

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
      utterances: botkit.utterances
    };

    bot.send = function(message, cb) {
      // TODO: Patrick
      // add logic to send messages to webchat client view socket.io
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
    });

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

    var server = require('http').Server(webserver);
    var io = require('socket.io')(server);

    io.on('connection', function(socket){
      webchatio_botkit.handleSocketPayload(socket, bot);
    });
    webchatio_botkit.log(
      '** Serving webhook endpoints for Webchat.io Platform at: ' +
      'http://' + facebook_botkit.config.hostname + ':' + facebook_botkit.config.port + '/facebook/receive');

    if (cb) {
      cb();
    }

    return facebook_botkit;
  };

  // TODO: Patrick
  webchatio_botkit.handleSocketPayload = function(socket, bot) {
    // TODO: Patrick/Josh - ingest the message
    webchatio_botkit.ingest(bot, message);
  };

  webchatio_botkit.startTicking();

  return webchatio_botkit;

};

module.exports = WebchatIObot;
