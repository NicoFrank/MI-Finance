const axios = require("axios");
const dotenv = require("dotenv");

/* Reading global variables from config file */
dotenv.config();
const API_KEY = process.env.API_KEY;

async function lookup(tickerSymbol) {

  let url =`https://cloud.iexapis.com/stable/stock/${tickerSymbol}/quote?token=${API_KEY}`;
  let response = await axios.get(url, { timeout: 5000 });
  return response.data;
}

module.exports = {
  lookup: lookup,
}
