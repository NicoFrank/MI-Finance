const express = require("express");
const dotenv = require("dotenv");
const helpers = require("./helpers");
var bodyParser = require("body-parser");
var pg = require("pg");
var session = require("express-session");


/* Reading global variables from config file */
dotenv.config();
const PORT = process.env.PORT;

const conString = process.env.DB_CON_STRING;
if(conString == undefined){
  console.log("ERROR: enviroment variable DB_CON_STRING not set.");
  process.exit(1);
}

const dbConfig = {
  connectionString: conString,
  ssl: {
    rejectUnauthorized: false
  }
}

//pg.default.ssl = true;

var dbClient  = new pg.Client(dbConfig);
dbClient.connect();


var urlencodedParser = bodyParser.urlencoded({ extended: false });
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

app.use(session({
    secret: "This is a secret!",
    resave: true,
    saveUninitialized: true
}));


/*app.get("/", async(req, res) => {
    try {
        let result = await helpers.lookup("NFLX");
        res.send(result.body);

    } catch(err) {
        console.log(helpers.API_KEY);
        console.log(err);
        res.status(400).send("Sorry, Fehler beim Abrufen des Aktienkurses.");
    }
});*/

app.get("/", function(req, res){
    res.render("login");
});
app.get("/login",function(req, res){
  res.render("login");
})

app.post("/", urlencodedParser, function (req, res) {
    var user = req.body.username;
    var password = req.body.password;

    dbClient.query("SELECT * FROM users WHERE username=$1 AND password=$2", [user, password], function (dbError, dbResponse) {
        if (dbResponse.rows.length == 0) {
            res.status(400).render("login", {
                error: "Oops. Bitte überprüfen Sie Nutzername und Passwort!"
            });
        } else {
            req.session.user = {
                userId: dbResponse.rows[0].id
            };
          res.render("kursabfrage");
        }
    });
});
app.post("/login", urlencodedParser, function (req, res) {
    var user = req.body.username;
    var password = req.body.password;

    dbClient.query("SELECT * FROM users WHERE username=$1 AND password=$2", [user, password], function (dbError, dbResponse) {
        if (dbResponse.rows.length == 0) {
            res.status(400).render("login", {
                error: "Oops. Bitte überprüfen Sie Nutzername und Passwort!"
            });
        } else {
            req.session.user = {
                userId: dbResponse.rows[0].id
            };
          res.render("kursabfrage");
        }
    });
});

app.post("/register", urlencodedParser, function (req, res) {
  var user = req.body.username;
  var password = req.body.password;
  var confirmation = req.body.confirmation;

  dbClient.query("SELECT * FROM users WHERE username=$1", [user], function (dbError, dbResponse) {
    if(dbResponse.rows.length != 0){
        res.status(400).render("register", {
        error: "Benutzername bereits vergeben"
      });
    }
    else if(user == "" || password == ""){

      res.status(400).render("register",{
        error:"Eingabe darf nicht leer sein"
      });
    }
    else if(password!=confirmation){
      res.status(400).render("register", {
        error: "Passwörter stimmen nicht überein"
      });
    }

    else{
    dbClient.query("INSERT INTO users(username, password) VALUES ($1, $2)",[user, password],function(dbError, dbResponse){
      res.render("login");
    });
    }
  });
});

app.get("/kursabfrage", function (req, res) {
    if (req.session.user != undefined) {
          res.render("kursabfrage");
    } else {
        res.render("error", {
            error: "You need to be logged in to access this page."
        });
    }
});

app.get("/logout", function(req, res) {
    req.session.destroy(function (err) {
        console.log("Session destroyed.");
    })
    res.render("login");
});

app.get("/register", function(req, res){
  res.render("register");
});


app.listen(PORT, function() {
  console.log(`MI Finance running and listening on port ${PORT}`);
});
