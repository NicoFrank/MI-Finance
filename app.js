const express = require("express");
const dotenv = require("dotenv");
const helpers = require("./helpers");

/* Reading global variables from config file */
dotenv.config();
const PORT = process.env.PORT;

/*
 *
 * Express setup
 *
*/

app = express();

//turn on serving static files (required for delivering css to client)
app.use(express.static("public"));
//configure template engine
app.set("views", "views");
app.set("view engine", "pug");

app.get('/', async (req, res) => {
    try {
        let result = await helpers.lookup("NFLX");
        res.send(result);
    } catch (err) {
        console.log(err);
        res.status(400).send("Sorry, Fehler beim Abrufen des Aktienkurses.");
    }
});

app.listen(PORT, function() {
  console.log(`MI Finance running and listening on port ${PORT}`);
});
