const HTTP = require('http');
const socketIO = require('socket.io');
const DefaultPageId = '9999999';

var WebchatIObot = function(botkit, configuration) {
  var webchatio_io = null;

  // Create a core botkit bot
  var webchatio_botkit = botkit.core(configuration || {});

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
      io: null,
      clients: {}
    };

    // send message using socket.io
    bot.send = function(message, cb) {
      var client = bot.clients[message.recipient.id] || {};
      var socketId = client && client.socketId || null;
      if (!socketId) {
        console.log('ERROR', bot.clients[message.recipient.id]);
      }
      var socket = bot.io.sockets.connected[socketId];

      socket.emit('messages', message);
      //botkit.debug('SOCKET.IO SUCCESS');
      cb && cb(null, { recipient_id: message.recipient.id });
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
    return bot;
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
  webchatio_botkit.createWebhookEndpoints = function(server, bot, cb) {

    var io = socketIO(server);

    webchatio_io = bot.io = io;
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

    bot.io.on('connection', (socket) => {

      socket.on('messages', (data) => {
        addClient(bot, socket.id, data)
        webchatio_botkit.ingest(bot, data, socket);
      });

      socket.on('messaging_postbacks', (data) => {
        addClient(bot, socket.id, data)
        webchatio_botkit.ingest(bot, data, socket);
      });

      socket.on('disconnect', () => {
        for (client in bot.clients) {
          if (bot.clients.hasOwnProperty(client) &&
              bot.clients[client] &&
              bot.clients[client].socketId === socket.id) {
            delete bot.clients[client];
          }
        }
      });

      socket.on('error', (error) => {
        webchatio_botkit.log('Error webchat.io socket.io', error);
      });

      // client requests profile information
      socket.on('profile_request', (data) => {
        var profile_items = [ '_greeting', '_get_started', '_menu'];

        profile_items.forEach((profile) => {
          webchatio_botkit.api.messenger_profile.postAPI(
            webchatio_botkit.api.messenger_profile[profile],
            socket);
        });
      });

      // response after an request to update profile [menu, greeting, get_started]
      socket.on('profile_update', (data) => {
        if (data) {
          if (data.error) {
            webchatio_botkit.log('ERROR in webchat profile API call: ', data.error.message);
          } else {
            webchatio_botkit.debug('Successfully configured webchat profile', data);
          }
        }
      });
    });
  };

  webchatio_botkit.middleware.spawn.use(function(worker, next) {

    // copy the identity that we get when the app initially boots up
    // into the specific bot instance
    worker.identity = webchatio_botkit.identity;
    next();
  });

  // universal normalizing steps
  // handle normal messages from users (text, stickers, files, etc count!)
  webchatio_botkit.middleware.normalize.use(function normalizeMessage(bot, message, next) {

      // handle normalization for sessions events
      if (message.field && message.field == 'sessions') {
          message.user = message.value.actor_id;
          message.channel = message.value.actor_id;

          // copy facebook specific features
          message.page = message.value;

          // set the event type
          message.type = message.value.event.toLowerCase();
      } else {

          //  in case of Checkbox Plug-in sender.id is not present, instead we should look at optin.user_ref
          if (!message.sender && message.optin && message.optin.user_ref) {
              message.sender = {id: message.optin.user_ref};
          }

          // capture the user ID
          message.user = message.sender.id;

          // since there are only 1:1 channels on Facebook, the channel id is set to the user id
          message.channel = message.sender.id;

          // copy over some facebook specific features
          message.page = bot.botkit.config.pageId || DefaultPageId;
      }

      next();
  });

  // handle normal messages from users (text, stickers, files, etc count!)
  webchatio_botkit.middleware.normalize.use(function handleMessage(bot, message, next) {
      if (message.message) {

          // capture the message text
          message.text = message.message.text;

          // copy over some facebook specific features
          message.seq = message.message.seq;
          message.is_echo = message.message.is_echo;
          message.mid = message.message.mid;
          message.sticker_id = message.message.sticker_id;
          message.attachments = message.message.attachments;
          message.quick_reply = message.message.quick_reply;
          message.nlp = message.message.nlp;
      }

      next();

  });

  // handle postback messages (when a user clicks a button)
  webchatio_botkit.middleware.normalize.use(function handlePostback(bot, message, next) {

      if (message.postback) {

          message.text = message.postback.payload;
          message.payload = message.postback.payload;

          message.referral = message.postback.referral;

          message.type = 'facebook_postback';

      }

      next();

  });

  // handle message sub-types
  webchatio_botkit.middleware.categorize.use(function handleOptIn(bot, message, next) {

      if (message.optin) {
          message.type = 'facebook_optin';
      }
      if (message.delivery) {
          message.type = 'message_delivered';
      }
      if (message.read) {
          message.type = 'message_read';
      }
      if (message.referral) {
          message.type = 'facebook_referral';
      }
      if (message.account_linking) {
          message.type = 'facebook_account_linking';
      }
      if (message.is_echo) {
          message.type = 'message_echo';
      }

      next();

  });

  /* Facebook Handover Protocol categorize middleware */
  webchatio_botkit.middleware.categorize.use(function threadControl(bot, message, next) {

      if (message.app_roles) {
          message.type = 'facebook_app_roles';
      }
      if (message.standby) {
          message.type = 'standby';
      }
      if (message.pass_thread_control) {
          message.type = 'facebook_receive_thread_control';
      }
      if (message.take_thread_control) {
          message.type = 'facebook_lose_thread_control';
      }

      next();

  });

  // handle delivery messages
  webchatio_botkit.middleware.receive.use(function handleDelivery(bot, message, next) {

      if (message.type === 'message_delivered' && webchatio_botkit.config.require_delivery) {
          // get list of mids in this message
          for (var m = 0; m < message.delivery.mids.length; m++) {
              var mid = message.delivery.mids[m];

              // loop through all active conversations this bot is having
              // and mark messages in conversations as delivered = true
              // note: we don't pass the real event in here because message_delivered events are excluded from conversations and won't ever match!
              bot.findConversation({user: message.user}, function(convo) {
                  if (convo) {
                      for (var s = 0; s < convo.sent.length; s++) {
                          if (convo.sent[s].sent_timestamp <= message.delivery.watermark ||
                        (convo.sent[s].api_response && convo.sent[s].api_response.message_id == mid)) {
                              convo.sent[s].delivered = true;
                          }
                      }
                  }
              });
          }
      }

      next();
  });

  var messenger_profile_api = {
    _greeting: {
      greeting: null
    },
    greeting: function(payload) {
      var message = {
        greeting: []
      };
      if (Array.isArray(payload)) {
        message.greeting = payload;
      } else {
        message.greeting.push({
          'locale': 'default',
          'text': payload
        });
      }
      webchatio_botkit.api.messenger_profile._greeting = message;
      webchatio_botkit.api.messenger_profile.postAPI(message);
    },
    delete_greeting: function() {
      webchatio_botkit.api.messenger_profile._greeting.greeting = null;
      webchatio_botkit.api.messenger_profile.deleteAPI('greeting');
    },
    get_greeting: function(cb) {
      return webchatio_botkit.api.messenger_profile._greeting;
    },
    _get_started: {
      get_started: null
    },
    get_started: function(payload) {
      var message = {
        get_started: {
          'payload': payload
        }
      };
      webchatio_botkit.api.messenger_profile._get_started = message;
      webchatio_botkit.api.messenger_profile.postAPI(message);
    },
    delete_get_started: function() {
      webchatio_botkit.api.messenger_profile._get_started.get_started = null;
      webchatio_botkit.api.messenger_profile.deleteAPI('get_started');
    },
    get_get_started: function(cb) {
      return webchatio_botkit.api.messenger_profile._get_started;
    },
    _menu: {
      persistent_menu: null
    },
    menu: function(payload) {
      var message = {
        persistent_menu: payload
      };
      webchatio_botkit.api.messenger_profile._menu = message;
      webchatio_botkit.api.messenger_profile.postAPI(message);
    },
    delete_menu: function() {
      webchatio_botkit.api.messenger_profile._menu.persistent_menu = null;
      webchatio_botkit.api.messenger_profile.deleteAPI('persistent_menu');
    },
    get_menu: function(cb) {
      return webchatio_botkit.api.messenger_profile._menu;
      if (cb) {
        cb();
      }
    },
    _account_linking: {
      account_linking_url: null
    },
    account_linking: function(payload) {
      var message = {
        account_linking_url: payload
      };
      webchatio_botkit.api.messenger_profile._account_linking = message;
      webchatio_botkit.api.messenger_profile.postAPI(message);
    },
    delete_account_linking: function() {
      webchatio_botkit.api.messenger_profile._account_linking.account_linking_url = null;
      webchatio_botkit.api.messenger_profile.deleteAPI('account_linking_url');
    },
    get_account_linking: function(cb) {
      return webchatio_botkit.api.messenger_profile._account_linking;
      if (cb) {
        cb();
      }
    },
    domain_whitelist: function(payload) {
      webchatio_botkit.debug('domain_whitelist not supported in webchat.io');
    },
    delete_domain_whitelist: function() {
      webchatio_botkit.debug('delete_domain_whitelist not supported in webchat.io');
    },
    get_domain_whitelist: function(cb) {
      webchatio_botkit.debug('get_domain_whitelist not supported in webchat.io');
      if (cb) {
        cb();
      }
    },
    target_audience: function(payload) {
      webchatio_botkit.debug('target_audience not supported in webchat.io');
    },
    delete_target_audience: function() {
      webchatio_botkit.debug('delete_target_audience not supported in webchat.io');
    },
    get_target_audience: function(cb) {
      webchatio_botkit.debug('get_target_audience not supported in webchat.io');
      if (cb) {
        cb();
      }
    },
    home_url: function(payload) {
      webchatio_botkit.debug('home_url not supported in webchat.io');
    },
    delete_home_url: function() {
      webchatio_botkit.debug('delete_home_url not supported in webchat.io');
    },
    get_home_url: function(cb) {
      webchatio_botkit.debug('get_home_url not supported in webchat.io');
      if (cb) {
        cb();
      }
    },
    postAPI: function(message, socket) {
      if (webchatio_io) {
        if (socket) {
          socket.emit('profile_post', message)
        } else {
          webchatio_io.sockets.emit('profile_post', message);
        }
      }
    },
    deleteAPI: function(type) {
      var message = {
        fields: [type]
      };

      if (webchatio_io) {
        webchatio_io.sockets.emit('profile_delete', message);
      }
    },
    getAPI: function(fields, cb) {
      webchatio_botkit.debug('getAPI not supported in webchat.io');
    },
    get_messenger_code: function(image_size, cb, ref) {
      webchatio_botkit.debug('get_messenger_code not supported in webchat.io');
      if (cb) {
        cb();
      }
    }
  };

  webchatio_botkit.api = {
    messenger_profile: messenger_profile_api,
    thread_settings: messenger_profile_api
  };

  // track the socket.id for each connected user
  function addClient(bot, socketId, data) {
    if (!data || !data.sender || !data.sender.id) {
      webchatio_botkit.log('ERROR data.sender.id is empty', data);
    }
    let userId = data.sender.id;
    if (!bot.clients[userId]) {
      bot.clients[userId] = {
        socketId
      };
    } else if (!bot.clients[userId].socketId || bot.clients[userId].socketId !== socketId) {
      bot.clients[userId].socketId = socketId;
    }
  }

  webchatio_botkit.startTicking();

  return webchatio_botkit;

};

module.exports = WebchatIObot;
