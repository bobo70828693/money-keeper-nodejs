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

    // get category sheet
    const categorySheet = googleDoc.sheetsByTitle['Category'];

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
        const [user, description, amount, category] = row._rawData;

        resultGroupByUser[user] = resultGroupByUser[user] || 0;
        resultGroupByUser[user] += Number(amount);
      }

      // print result
      let index = 0;
      let textOfSum = 'The expense of current month\'s are as follow: \n';
      for (const key of Object.keys(resultGroupByUser)) {
        // skip empty user
        if (key === '') {
          continue;
        }

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

    if (message === '目前分類') {

      // get sheet rows
      const rows = await categorySheet.getRows();

      let textOfCategory = 'The categories are as follow: \n';
      let index = 0;
      for(const row of rows) {
        // category format: [id] [name] [budget]
        const [id, name, budget] = row._rawData;
        textOfCategory += `ID: ${id}, Name: ${name}, Budget: ${budget}`;
        if (rows.length-1 > index) {
          textOfCategory += `\n`;
        }
        index ++;
      }

      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: textOfCategory
          }
        ]
      });
    }

    if (message === '本月餘額') {
      // get sheet rows
      const categories = await categorySheet.getRows();
      // get expense sheet rows
      const expenses = await sheet.getRows();

      // sort categories by id
      let categoryMap = [];
      for (let category of categories) {
        const [id, name, budget] = category._rawData;

        categoryMap.push({
          id: Number(id),
          name,
          budget,
          expense: 0,
          count: 0,
        });
      }

      for (let expense of expenses) {
        const [user, description, amount, category] = expense._rawData;

        // extract category id
        const categoryId = Number(category);

        const foundCategory = categoryMap.find(c => c.id === categoryId);

        if (!foundCategory) {
          console.log(`Category not found: ${category}`);
          continue;
        }

        foundCategory.expense += Number(amount);
        foundCategory.budget -= Number(amount);
        foundCategory.count ++;
      }

      // calculate budget balance
      let textOfExpenseByCategory = 'Here is your expense by category:\n\n';

      let index = 0;
      for (const category of categoryMap) {
        const averagePrice = Math.round(category.expense / category.count);
        textOfExpenseByCategory += `${category.name}, Average price: $${averagePrice}`;
        if (categoryMap.length-1 > index) {
          textOfExpenseByCategory += `\n`;
        }
        index ++;
      }

      // only reply in production
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: textOfExpenseByCategory
          }
        ]
      });
    }

    // Handle the basic event - [user] [description] [amount] [_category]
    const messageArr = message.split(' ');

    if (messageArr.length < 3) {
      if (DEBUG) {
        console.log("DEBUG MODE: Invalid message format. Please follow this format: [user] [description] [amount] [_category]");
        return;
      }

      // only reply in production
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'Invalid message format. Please follow this format: [user] [description] [amount] [_category]'
          }
        ]
      });
    }

    const [user, description, amount, category] = messageArr;

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
      Description: description,
      Category: category || null,
      Amount: amount,
      CreatedAt: moment().tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
    });
  }
}

console.log(`LISTENING ON PORT ${process.env.PORT}`);
app.listen(process.env.PORT || 80, '0.0.0.0');
