/* jshint node: true */
'use strict';

module.exports = function(pageId, req, res, next) {
  var data = req.body;

  try {
      var
        timestamp = parseInt(data.timestamp),
        hasMessage = !!data.message,
        hasText = hasMessage && !!data.message.text,
        hasPostback = !!data.postback
      ;
      var messageData = {
        "object": "page",
        "entry": [
          {
            "id": pageId,
            "time": timestamp,
            "messaging": [
              {
                "sender": {
                  "id": data.id
                },
                "recipient": {
                  "id": pageId
                },
                "timestamp": timestamp
              }
            ]
          }
        ]
      };
      if (hasText) {
        messageData.entry[0].messaging[0].message = {
          "text": data.message.text
        };
      }
      if (hasPostback) {
        messageData.entry[0].messaging[0].postback = data.postback;
      }

      req.body = messageData;
    }
    catch (err) {
      console.error('facebookTransform', err);
    }
  next();
};
