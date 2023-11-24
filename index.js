'use strict';

const path = require('path');

// load env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { LINE_BOT_CHANNEL_SECRET, LINE_BOT_ACCESS_TOKEN, GOOGLE_DOC_ID } = process.env;

// third-party
const express = require('express');
const moment = require('moment');
const bodyParser = require('body-parser');

// services
const { getDocInfo, createSheet } = require('./services/googleSheet');

// line-bot middleware
const line = require('@line/bot-sdk');

const app = express();
// app.use(bodyParser.json()); // !NOTE: for testing only

// create LINE SDK config from env variables
const config = {
  channelAccessToken: LINE_BOT_ACCESS_TOKEN,
  channelSecret: LINE_BOT_CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: LINE_BOT_ACCESS_TOKEN
});

app.post('/callback', line.middleware(config), (req, res) => {
  // req.body.events should be an array of events
  const events = req.body.events;
  console.log("EVENTS", events);

  Promise
    .all(events.map(handleEvent))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });

  return res.status(200).json({
    message: 'OK'
  });
});

async function handleEvent(event) {

  if (event.type === 'message' && event.message.type === 'text') {
    // get google doc
    let googleDoc = await getDocInfo(GOOGLE_DOC_ID);

    // get today's sheet
    const today = moment().format('YYYY-MM-DD');

    // check if sheet exists
    let sheet = googleDoc.sheetsByTitle[today];

    // if not, create one
    if (!sheet) {
      const headerValues = ['User', 'Category', 'Amount', 'CreatedAt'];
      const sheetName = today;
      const docId = GOOGLE_DOC_ID;

      // create sheet
      sheet = await createSheet({ docId, headerValues, sheetName });
    }

    // validate message
    const message = event.message.text;
    const messageArr = message.split(' ');

    if (messageArr.length !== 3) {
      return client.replyMessage(event.replyToken, "Invalid message format");
    }

    const [user, category, amount] = messageArr;

    // add row
    await sheet.addRow({
      User: user,
      Category: category,
      Amount: amount,
      CreatedAt: moment().format('YYYY-MM-DD HH:mm:ss')
    });
  }
}

console.log(`LISTENING ON PORT ${process.env.PORT}`);
app.listen(process.env.PORT || 80, '0.0.0.0');
