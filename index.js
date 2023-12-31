'use strict';

const path = require('path');

// load env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { LINE_BOT_CHANNEL_SECRET, LINE_BOT_ACCESS_TOKEN, GOOGLE_DOC_ID, DEBUG } = process.env;

// third-party
const express = require('express');
const moment = require('moment-timezone');
const bodyParser = require('body-parser');
const line = require('@line/bot-sdk'); // line-bot

// services
const { getDocInfo, createSheet } = require('./services/googleSheet');


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

    // get month's sheet
    const month = moment().tz('Asia/Taipei').format('YYYY-MM');

    // check if sheet exists
    let sheet = googleDoc.sheetsByTitle[month];

    // if not, create one
    if (!sheet) {
      const headerValues = ['User', 'Category', 'Amount', 'CreatedAt'];
      const sheetName = month;
      const docId = GOOGLE_DOC_ID;

      // create sheet
      sheet = await createSheet({ docId, headerValues, sheetName });
    }

    // validate message
    const message = event.message.text;

    if (message === '目前花費') {
      // get sheet rows
      const rows = await sheet.getRows();

      // calculate sum for each user
      const resultGroupByUser = {};
      for (const row of rows) {
        const [user, category, amount] = row._rawData;

        resultGroupByUser[user] = resultGroupByUser[user] || 0;
        resultGroupByUser[user] += Number(amount);
      }

      // print result
      let index = 0;
      let textOfSum = 'The expense of current month\'s are as follow: \n';
      for (const key of Object.keys(resultGroupByUser)) {
        textOfSum += `${key}: $${resultGroupByUser[key]}`;

        if (Object.keys(resultGroupByUser).length-1 > index) {
          textOfSum += `\n`;
        }
        index ++;
      }

      if (DEBUG) {
        console.log(textOfSum);
        return;
      }

      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: textOfSum
          }
        ]
      });
    }

    // Handle the basic event - [user] [category] [amount]
    const messageArr = message.split(' ');

    if (messageArr.length !== 3) {
      if (DEBUG) {
        console.log("DEBUG MODE: Invalid message format. Please follow this format: [user] [category] [amount]");
        return;
      }

      // only reply in production
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'Invalid message format. Please follow this format: [user] [category] [amount]'
          }
        ]
      });
    }

    const [user, category, amount] = messageArr;

    // validate amount
    if (isNaN(amount)) {
      if (DEBUG) {
        console.log("DEBUG MODE: Invalid amount. Please enter a number.");
        return;
      }

      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'Invalid amount. Please enter a number.'
          }
        ]
      });
    }

    // add row
    await sheet.addRow({
      User: user,
      Category: category,
      Amount: amount,
      CreatedAt: moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss')
    });
  }
}

console.log(`LISTENING ON PORT ${process.env.PORT}`);
app.listen(process.env.PORT || 80, '0.0.0.0');
