var express = require('express');
var uuid = require('uuid');
var cors = require('cors');
var bodyParser = require('body-parser');
var webchatSession = require('./webchat_session.js');
var facebookTransform = require('./facebook_transform.js');

const
  RECEIVE_URL = '/webchat/receive',
  THREAD_SETTING_URL = '/webchat/thread-setting'
;

var Webchatbot = function(botkit, configuration) {
  var pageId = configuration.pageId || uuid.v4();

  // Create a core botkit bot
  var webchat_botkit = botkit.core(configuration || {});

  if (webchat_botkit.config.require_delivery) {

    webchat_botkit.on('message_delivered', function(bot, message) {

      // get list of mids in this message
      for (var m = 0; m < message.delivery.mids.length; m++) {
        var mid = message.delivery.mids[m];

        // loop through all active conversations this bot is having
        // and mark messages in conversations as delivered = true
        bot.findConversation(message, function(convo) {
          if (convo) {
            for (var s = 0; s < convo.sent.length; s++) {
              if (convo.sent[s].sent_timestamp <= message.delivery.watermark ||
                (convo.sent[s].api_response && convo.sent[s].api_response.mid == mid)) {
                convo.sent[s].delivered = true;
              }
            }
          }
        });
      }
    });
  }

  // customize the bot definition, which will be used when new connections
  // spawn!
  webchat_botkit.defineBot(function(botkit, config) {

    var bot = {
      type: 'webchat',
      botkit: botkit,
      config: config || {},
      utterances: botkit.utterances,
      replies: {},
      replyResponses: {}
    };

    bot.startConversation = function(message, cb) {
      botkit.startConversation(this, message, cb);
    };

    bot.createConversation = function(message, cb) {
      botkit.createConversation(this, message, cb);
    };


    bot.send = function(message, cb) {

      var
        webchat_message = {
          recipient: {},
          message: message.sender_action ? undefined : {}
        },
        delay = (Number.isInteger(message.delay) && message.delay > 0) ?
          message.delay :
          0,
        msgType = 'text'
      ;
      if (message.sender_action) {
        msgType = message.sender_action;
      } else if (message.attachment) {
        switch (message.attachment.type) {
          case 'audio':
          case 'file':
          case 'image':
          case 'video':
            msgType = 'media'
            break;
          case 'template':
          default:
            msgType = 'template'
        }
      }

      if (typeof(message.channel) == 'string' && message.channel.match(/\+\d+\(\d\d\d\)\d\d\d\-\d\d\d\d/)) {
        webchat_message.recipient.phone_number = message.channel;
      } else {
        webchat_message.recipient.id = message.channel;
      }

      if (!message.sender_action) {
        if (message.text) {
          webchat_message.message.text = message.text;
        }

        if (message.attachment) {
          webchat_message.message.attachment = message.attachment;
        }

        if (message.sticker_id) {
          webchat_message.message.sticker_id = message.sticker_id;
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

          webchat_message.message.quick_replies = message.quick_replies.map(function(item) {
            return {
              content_type: item.content_type || 'text',
              title: titleLimit(item.title),
              payload: item.payload,
              image_url: item.image_url,
            };
          });
        }
      } else {
        webchat_message.sender_action = message.sender_action;
      }

      if (message.sender_action) {
        webchat_message.sender_action = message.sender_action;
      }

      if (message.notification_type) {
        webchat_message.notification_type = message.notification_type;
      }

      //Add Access Token to outgoing request
      webchat_message.access_token = configuration.access_token;

      if (bot.replies[webchat_message.recipient.id]) {
        bot.replies[webchat_message.recipient.id].messages.push(
          { type: msgType, delay: delay, message: webchat_message.message }
        );
      } else {
        bot.replies[webchat_message.recipient.id] = {
          sessionId: webchat_message.recipient.id,
          messages: [ { type: msgType, delay: delay, message: webchat_message.message } ]
        };
      }
      //console.log('');
      //console.log('---- SEND ----');
      //console.log(JSON.stringify(message));
      //console.log('webchat_message', JSON.stringify(webchat_message));
      //console.log(JSON.stringify(bot.replies));
      //console.log('');
      // request({
      //   method: 'POST',
      //   json: true,
      //   headers: {
      //     'content-type': 'application/json',
      //   },
      //   body: webchat_message,
      //   uri: 'https://graph.facebook.com/v2.6/me/messages'
      // },
      //   function(err, res, body) {
      //
      //
      //     if (err) {
      //       botkit.debug('WEBHOOK ERROR', err);
      //       return cb && cb(err);
      //     }
      //
      //     if (body.error) {
      //       botkit.debug('API ERROR', body.error);
      //       return cb && cb(body.error.message);
      //     }
      //
      //     botkit.debug('WEBHOOK SUCCESS', body);
      //     cb && cb(null, body);
      //   });
      cb && cb(null, webchat_message);
    };

    bot.sendReplies = function(src, cb) {
      //console.log('sendReplies', JSON.stringify(src));
      var
        user = src.user,
        replyResponse = bot.replyResponses[user].shift(),
        messages = bot.replies[user]
      ;
      delete bot.replies[user]
      replyResponse.send(messages);
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
      var text;

      if (typeof(resp) == 'string') {
        text = resp;
      } else {
        text = resp.text;
      }

      var avgWPM = 85;
      var avgCPM = avgWPM * 7;

      var typingLength = Math.min(Math.floor(text.length / (avgCPM / 60)) * 1000, 5000);

      bot.startTyping(src, function(err) {
        if (err) console.log(err);
        setTimeout(function() {
          bot.reply(src, resp, cb);
        }, typingLength);
      });

    };

    bot.reply = function(src, resp, cb) {
      bot.delayReply(src, resp, 0, cb);
    };

    bot.delayReply = function(src, resp, delay, cb) {
      delay = (Number.isInteger(delay) && delay > 0) ? delay : 0;
      var
        msg = {}
      ;
      if (typeof(resp) == 'string') {
        msg.text = resp;
      } else {
        msg = resp;
      }
      // set delay
      msg.delay = delay;

      msg.channel = src.channel;

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
    return bot;
  });

  // set up a web route for receiving outgoing webhooks and/or slash commands

  webchat_botkit.createWebhookEndpoints = function(webserver, bot, cb) {
    var port = webserver.get('port');

    // set middleware for getting session
    webserver.use(RECEIVE_URL, webchatSession);

    // transform message into facebook format
    webserver.use(RECEIVE_URL, function (req, res, next) {
      return facebookTransform(pageId, req, res, next);
    });

    webchat_botkit.log(
      '** Serving webhook endpoints for Webchat Platform at: ' +
      'http://' + webchat_botkit.config.hostname + ':' + port + RECEIVE_URL);
    webserver.post(RECEIVE_URL, cors(), function(req, res) {
      // with webchat, the res needs to contain the messages
      // res.send('ok');
      webchat_botkit.handleWebhookPayload(req, res, bot);
    });

    webserver.get(`${THREAD_SETTING_URL}/:threadSetting?`, cors(), function(req, res) {
      var
        threadSetting = req.params.threadSetting || ''
      ;
      switch (threadSetting) {
        case 'menu':
          res.send(webchat_botkit.api.thread_settings.getMenu);
          break;
        case 'greeting':
          res.send(webchat_botkit.api.thread_settings.getGreeting);
          break;
        case 'first-messages':
          res.send(webchat_botkit.api.thread_settings.getFirstMessages);
          break;
        default:
          res.send({
            firstMessages: webchat_botkit.api.thread_settings.getFirstMessages,
            greetingText: webchat_botkit.api.thread_settings.getGreeting,
            persistentMenu: webchat_botkit.api.thread_settings.getMenu
          });
      }
    });

    if (cb) {
      cb();
    }

    return webchat_botkit;
  };

  webchat_botkit.handleWebhookPayload = function(req, res, bot) {
    var obj = req.body;

    if (obj.entry) {
      for (var e = 0; e < obj.entry.length; e++) {
        for (var m = 0; m < obj.entry[e].messaging.length; m++) {
          var webchat_message = obj.entry[e].messaging[m];

          // add the res to the bot, so it can reply
          // once all the messages are added
          if (!bot.replyResponses[webchat_message.sender.id]) {
            bot.replyResponses[webchat_message.sender.id] = []
          }
          bot.replyResponses[webchat_message.sender.id].push(res);

          if (webchat_message.message) {
            var message = {
              text: webchat_message.message.text,
              user: webchat_message.sender.id,
              channel: webchat_message.sender.id,
              timestamp: webchat_message.timestamp,
              seq: webchat_message.message.seq,
              is_echo: webchat_message.message.is_echo,
              mid: webchat_message.message.mid,
              sticker_id: webchat_message.message.sticker_id,
              attachments: webchat_message.message.attachments,
              quick_reply: webchat_message.message.quick_reply,
              type: 'user_message',
              reply_response: res
            };

            webchat_botkit.receiveMessage(bot, message);
          } else if (webchat_message.postback) {

            // trigger BOTH a facebook_postback event
            // and a normal message received event.
            // this allows developers to receive postbacks as part of a conversation.
            var message = {
              text: webchat_message.postback.payload,
              payload: webchat_message.postback.payload,
              user: webchat_message.sender.id,
              channel: webchat_message.sender.id,
              timestamp: webchat_message.timestamp,
              referral: webchat_message.postback.referral,
              reply_response: res
            };

            webchat_botkit.trigger('facebook_postback', [bot, message]);

            if (webchat_botkit.config.receive_via_postback) {
              var message = {
                text: webchat_message.postback.payload,
                user: webchat_message.sender.id,
                channel: webchat_message.sender.id,
                timestamp: webchat_message.timestamp,
                type: 'facebook_postback',
                referral: webchat_message.postback.referral,
                reply_response: res
              };

              webchat_botkit.receiveMessage(bot, message);
            }

          } else if (webchat_message.optin) {

            var message = {
              optin: webchat_message.optin,
              user: webchat_message.sender.id,
              channel: webchat_message.sender.id,
              timestamp: webchat_message.timestamp,
              reply_response: res
            };

            webchat_botkit.trigger('facebook_optin', [bot, message]);
          } else if (webchat_message.delivery) {

            var message = {
              delivery: webchat_message.delivery,
              user: webchat_message.sender.id,
              channel: webchat_message.sender.id,
              reply_response: res
            };

            webchat_botkit.trigger('message_delivered', [bot, message]);
          } else if (webchat_message.read) {

            var message = {
              read: webchat_message.read,
              user: webchat_message.sender.id,
              channel: webchat_message.sender.id,
              timestamp: webchat_message.timestamp,
              reply_response: res
            };

            webchat_botkit.trigger('message_read', [bot, message]);
          } else if (webchat_message.referral) {
            var message = {
              user: webchat_message.sender.id,
              channel: webchat_message.sender.id,
              timestamp: webchat_message.timestamp,
              referral: webchat_message.referral,
              reply_response: res
            };

            webchat_botkit.trigger('facebook_referral', [bot, message]);
          }  else {
            webchat_botkit.log('Got an unexpected message from Facebook: ', webchat_message);
          }
        }
      }
    }
  };

  webchat_botkit.setupWebserver = function(port, cb) {

    if (!port) {
      throw new Error('Cannot start webserver without a port');
    }

    var static_dir =  process.cwd() + '/public';

    if (webchat_botkit.config && webchat_botkit.config.webserver && webchat_botkit.config.webserver.static_dir)
      static_dir = webchat_botkit.config.webserver.static_dir;

    webchat_botkit.config.port = port;

    webchat_botkit.webserver = express();

    webchat_botkit.webserver.use(bodyParser.json());
    webchat_botkit.webserver.use(bodyParser.urlencoded({ extended: true }));
    webchat_botkit.webserver.use(express.static(static_dir));

    var server = webchat_botkit.webserver.listen(
      webchat_botkit.config.port,
      webchat_botkit.config.hostname,
      function() {
        webchat_botkit.log('** Starting webserver on port ' +
          webchat_botkit.config.port);
        if (cb) { cb(null, webchat_botkit.webserver); }
      })
    ;

    return webchat_botkit;
  };

  webchat_botkit.api = {
    'thread_settings': {
      greeting: function(greeting) {
        greeting = typeof greeting === 'string' ? greeting : '';
        webchat_botkit.api.thread_settings.getGreeting = greeting;
      },
      getGreeting: '',
      first_messages: function(payload) {
        payload = Array.isArray(payload) ? payload : [];
        if (payload && payload.length) {
          var
            firstMsg = payload[0],
            valid = firstMsg.type && firstMsg.message
          ;
          payload = valid ? payload : [];
        }
        webchat_botkit.api.thread_settings.getFirstMessages = payload;
      },
      getFirstMessages: [],
      menu: function(payload) {
        payload = Array.isArray(payload) ? payload : [];
        var message = {
          'setting_type': 'call_to_actions',
          'thread_state': 'existing_thread',
          'call_to_actions': payload
        };
        webchat_botkit.api.thread_settings.getMenu = message;
      },
      getMenu: {
        'setting_type': 'call_to_actions',
        'thread_state': 'existing_thread',
        'call_to_actions': []
      }
    }
  };

  return webchat_botkit;
};

module.exports = Webchatbot;
