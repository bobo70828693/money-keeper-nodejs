'use strict';

const path = require('path');

// load env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { GOOGLE_SHEET_EMAIL, GOOGLE_SHEET_PRIVATE_KEY } = process.env;

// third-party
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const serviceAccountAuth = new JWT({
  email: GOOGLE_SHEET_EMAIL,
  key: GOOGLE_SHEET_PRIVATE_KEY.split(String.raw`\n`).join('\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

module.exports = {
  getDocInfo,
  getSheetRows,
  createSheet,
  addRow
};

async function getDocInfo(docId) {
  const doc = new GoogleSpreadsheet(docId, serviceAccountAuth);
  await doc.loadInfo();

  return doc;
}

async function getSheetRows(docId, sheetId) {
  const result = [];
  const doc = new GoogleSpreadsheet(docId, serviceAccountAuth);
  await doc.loadInfo();

  const sheet = doc.sheetsById[sheetId];
  const rows = await sheet.getRows();

  rows.forEach((row) => {
    result.push(row._rawData);
  });

  return result;
}

async function createSheet({docId, headerValues, sheetName, sheetId}) {
  const doc = new GoogleSpreadsheet(docId, serviceAccountAuth);
  await doc.loadInfo();

  const createSheetParams = {
    headerValues,
    title: sheetName,
  };

  if (sheetId) {
    createSheetParams.sheetId = sheetId;
  }

  const newSheet = await doc.addSheet(createSheetParams);

  return newSheet;
}

async function addRow(sheet, row) {
  return await sheet.addRow(row);
}
