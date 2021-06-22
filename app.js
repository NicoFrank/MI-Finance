//python3 -m check50 --local mheckner/mi-check50/master/finance

const express = require("express");
const dotenv = require("dotenv");
const helpers = require("./helpers");
var bodyParser = require("body-parser");
var pg = require("pg");
var session = require("express-session");
const bcrypt = require("bcrypt");
const saltRounds = 10;

/* Reading global variables from config file */
dotenv.config();
const PORT = process.env.PORT;

const conString = process.env.DB_CON_STRING;
if (conString == undefined) {
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

var dbClient = new pg.Client(dbConfig);
dbClient.connect();


var urlencodedParser = bodyParser.urlencoded({
  extended: false
});
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
  cookie: {
    maxAge: 600000
  }, //(10min)
  resave: true,
  saveUninitialized: true
}));

function initSession(session) {
  if (session.user == undefined) {
    session.user = ""
    session.userid = -1
    session.logedin = false
  } else {
    return false
  }
}



app.get("/", function(req, res) {
  let username = req.session.user;
  if (req.session.logedin) {
    dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND symbol=$2", [req.session.userid, 'CASH'], function(dbError, dbResponse) {
      let cash = Number(dbResponse.rows[0].total);
      let total = cash;
      dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND symbol!= $2", [req.session.userid, 'CASH'], function(dbError, dbResponse) {
        if (dbResponse.rows.length != 0) {
          let overviewItems = dbResponse.rows;
          for (let i = 0; i < overviewItems.length; i++) {
            total += overviewItems[i].price * overviewItems[i].count;
          }
          total = total.toFixed(2);
          res.render("overview", {
            username: username,
            overviewItems: overviewItems,
            total: total,
            cash: cash
          });
        } else {
          res.render("overview", {
            username: username,
            total: total,
            cash: cash
          })
        }
      });
    });
  } else res.render("landing");
});
app.get("/login", function(req, res) {
  initSession(req.session);
  res.render("login");
});

app.post("/login", urlencodedParser, function(req, res) {
  var user = req.body.username;
  var password = req.body.password;

  initSession(req.session);

  dbClient.query("SELECT * FROM users WHERE username=$1", [user], function(dbError, dbResponse) {
    if (dbResponse.rows.length == 0) {
      res.status(400).render("login", {
        error: "Oops. Bitte überprüfen Sie Nutzername und Passwort!"
      });
    } else {
      let hash = dbResponse.rows[0].password;
      bcrypt.compare(password, hash, function(err, result) {
        if (result) {
          req.session.userid = dbResponse.rows[0].user_id;
          req.session.user = user;
          req.session.logedin = true;
          console.log("login successful");
          res.redirect("/");
        } else {
          res.status(400).render("login", {
            error: "username and password do not match"
          });
        }
      });
    }
  });
});

app.get("/register", function(req, res) {
  res.render("register");
});

app.post("/register", urlencodedParser, function(req, res) {
  var user = req.body.username;
  var password = req.body.password;
  var confirmation = req.body.confirmation;

  dbClient.query("SELECT * FROM users WHERE username=$1", [user], function(dbError, dbResponse) {
    if (dbResponse.rows.length != 0) {
      res.status(400).render("register", {
        error: "username taken"
      });
    } else if (user == "" || password == "") {
      res.status(400).render("register", {
        error: "input cannot be empty"
      });
    } else if (password != confirmation) {
      res.status(400).render("register", {
        error: "passwords do not match"
      });
    } else {
      bcrypt.hash(password, saltRounds, function(err, hash) {
        dbClient.query("INSERT INTO users(username, password) VALUES ($1, $2)", [user, hash], function(dbError, dbResponse) { //add user anad encrypted password in databank
          dbClient.query("SELECT user_id FROM users WHERE username=$1", [user], function(dbError, dbResponse) { //get User id
            let user_id = dbResponse.rows[0].user_id;
            dbClient.query("INSERT INTO finance_overview(user_id, symbol, total) VALUES ($1, $2, $3)", [user_id, 'CASH', 10000.00]); //give
            res.render("login");
          });
        });
      });
    }
  });
});
app.get("/quote", function(req, res) {
  if (req.session.logedin) res.render("quote");
  else {
    res.render("login", {
      error: "You need to be logged in to access this page."
    });
  }
});
app.post("/quote", urlencodedParser, async (req, res) => {
  let symbol = req.body.symbol;
  try {
    let result = await helpers.lookup(symbol);

    res.render("quote", {
      result: result.latestPrice,
      name: result.companyName,
      symbol: symbol
    });

  } catch (err) {
    res.status(400).render("quote", {
      error: "invalid symbol"
    });
  }
});

app.get("/buy", function(req, res) {
  if (req.session.logedin) res.render("buy");
  else {
    res.render("login", {
      error: "You need to be logged in to access this page."
    });
  }
});

app.post("/buy", urlencodedParser, async (req, res) => {
  let symbol = req.body.symbol;
  let count = Number(req.body.shares);
  let user_id = req.session.userid;
  if (symbol.lenght == 0 || count <= 0) {
    res.status(400).render("buy", {
      error: "invalid input"
    });
  } else {
    try {
      let result = await helpers.lookup(symbol);
      dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND symbol='CASH'", [user_id], function(dbError, dbResponse) {
        if (dbResponse.rows.length != 0) {
          let cash = Number(dbResponse.rows[0].total);
          let latest_price = Number(result.latestPrice);
          let cost = latest_price * count;
          let new_cash = (cash - cost).toFixed(2);


          if (cost > cash) {
            res.status(400).render("buy", {
              error: "not enough money"
            });

          } else {
            dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND symbol=$2", [user_id, symbol], function(dbError, dbResponse) {
              if (dbResponse.rows.length != 0) {
                let new_count = Number(dbResponse.rows[0].count) + count;
                let new_total = (cost + Number(dbResponse.rows[0].total)).toFixed(2);
                dbClient.query("UPDATE finance_overview SET count=$1, price=$2, total=$3 WHERE user_id=$4 AND symbol=$5", [new_count, latest_price, new_total, user_id, symbol]);
              } else {
                dbClient.query("INSERT INTO finance_overview (user_id, symbol, name, count, price, total) VALUES ($1, $2, $3, $4, $5, $6)", [user_id, symbol, result.companyName, count, latest_price, cost]);
              }
              dbClient.query("INSERT INTO finance_transactions (user_id, symbol, name, count, price, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [user_id, symbol, result.companyName, count, latest_price, (new Date()).toLocaleString("en-US")]);
              dbClient.query("UPDATE finance_overview SET total =$1 WHERE user_id=$2 AND symbol=$3", [new_cash, user_id, 'CASH']);
              res.render("buy", {
                success: "buy successful"
              });
            });
          }
        }
      });
    } catch (err) {
      //console.log(helpers.API_KEY);
      //console.log(err);
      res.status(400).render("buy", {
        error: "invalid symbol"
      });
    }
  }
});

app.get("/sell", function(req, res) {
  if (req.session.logedin) {
    dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND count>0", [req.session.userid], function(dbError, dbResponse) {
      let tickerItems = dbResponse.rows;
      res.render("sell", {
        tickerItems: tickerItems
      });
    });

  } else {
    res.render("login", {
      error: "You need to be logged in to access this page."
    });
  }
});
app.post("/sell", urlencodedParser, async (req, res) => {
  let symbol = req.body.symbol;
  let count = Number(req.body.shares);
  let user_id = req.session.userid;
  let tickerItems = [];


  dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND count>0", [user_id], function(dbError, dbResponse) {
    tickerItems = dbResponse.rows;
  });
  if (symbol == undefined) {
    res.status(400).render("sell", {
      error: "no share selected"
    });
  } else {
    try {
      let result = await helpers.lookup(symbol);

      dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND symbol='CASH'", [user_id], function(dbError, dbResponse) {
        if (dbResponse.rows.length != 0) {
          let cash = Number(dbResponse.rows[0].total);
          let latest_price = Number(result.latestPrice);
          let cost = Number(latest_price * count);
          let new_cash = (cash + cost).toFixed(2);


          if (count <= 0) {
            res.status(400).render("sell", {
              error: "invalid input",
              tickerItems: tickerItems
            });
          } else {
            dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND symbol=$2", [user_id, symbol], function(dbError, dbResponse) {
              if (dbResponse.rows.length != 0) {
                if (count > dbResponse.rows[0].count) {
                  res.status(400).render("sell", {
                    error: "not enough shares",
                    tickerItems: tickerItems
                  });
                } else {
                  let new_count = Number(dbResponse.rows[0].count) - count;
                  let new_total = (Number(dbResponse.rows[0].total) - cost).toFixed(2);
                  if (new_count == 0) {
                    dbClient.query("DELETE FROM finance_overview WHERE user_id=$1 AND symbol= $2", [user_id, symbol]);
                  } else {
                    dbClient.query("UPDATE finance_overview SET count=$1, price=$2, total=$3 WHERE user_id=$4 AND symbol=$5", [new_count, latest_price, new_total, user_id, symbol]);
                  }
                  dbClient.query("INSERT INTO finance_transactions (user_id, symbol, name, count, price, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [user_id, symbol, result.companyName, -count, latest_price, new Date().toISOString().slice(0, 19).replace('T', ' ')]);
                  dbClient.query("UPDATE finance_overview SET total=$1 WHERE user_id=$2 AND symbol=$3", [new_cash, user_id, 'CASH']);

                  res.render("sell", {
                    success: "sale successful",
                    tickerItems: tickerItems
                  });
                }
              } else {
                res.status(400).render("sell", {
                  error: "error in sale",
                  tickerItems: tickerItems
                });
              }
            });
          }
        }
      });
    } catch (err) {
      console.log(helpers.API_KEY);
      console.log(err);
      res.status(400).render("sell", {
        error: "error in sale"
      });
    }
  }
});
app.get("/history", function(req, res) {
  if (req.session.logedin) {
    dbClient.query("SELECT * FROM finance_transactions WHERE user_id=$1", [req.session.userid], function(dbError, dbResponse) {
      let transactionItems = dbResponse.rows;
      if (transactionItems.length != 0) {
        res.render("history", {
          transactionItems: transactionItems
        });
      } else {

        res.render("history");
      }
    });
  } else {
    res.render("login", {
      error: "You need to be logedin to access this page."
    });
  }
});
app.post("/history", urlencodedParser, function(req, res) {
  let user_id = req.session.userid;
  dbClient.query("DELETE FROM finance_transactions WHERE user_id = $1", [user_id], function(dbError, dbResponse) {
    res.render("history", {
      success: "History has been cleared"
    });
  });
});
app.get("/account", function(req, res) {
  if (req.session.logedin) {
    dbClient.query("SELECT * FROM finance_overview WHERE user_id=$1 AND symbol='CASH'", [req.session.userid], function(dbError, dbResponse) {
      let total = dbResponse.rows[0].total;
      res.render("account", {
        username: req.session.user,
        cash: total
      });
    });
  } else {
    res.render("login", {
      error: "You need to be logged in to access this page."
    });
  }
});
app.get("/changepassword", function(req, res) {
  if (req.session.logedin) {
    res.render("changepassword");
  } else {
    res.render("login", {
      error: "You need to be logged in to access this page."
    });
  }
});
app.post("/changepassword", urlencodedParser, function(req, res) {
  let newpassword = req.body.password;
  let confirmation = req.body.confirmation;
  let user_id = req.session.userid;
  if (confirmation != newpassword) {
    res.render("changepassword", {
      error: "passwords do not match"
    });
  } else {
  dbClient.query("SELECT * FROM users WHERE user_id=$1", [user_id], function(dbError, dbResponse) {

    let hash = dbResponse.rows[0].password;
    bcrypt.compare(newpassword, hash, function(err, result) {
      if (!result) {
        bcrypt.hash(newpassword, saltRounds, function(err, hash) {
          dbClient.query("UPDATE users SET password = $1 WHERE user_id = $2", [hash, user_id], function(dbError, dbResponse) {
            res.render("account", {
              success: "password has been changed"
            });
          });
        });

      } else {
        res.status(400).render("changepassword", {
          error: "New password can't be old password"
        });
      }
    });
  });
}
});
app.get("/addmoney", function(req, res) {
  if (req.session.logedin) {
    res.render("addmoney");
  } else {
    res.render("login", {
      error: "You need to be logged in to access this page."
    });
  }
});
app.post("/addmoney", urlencodedParser, function(req, res) {
  let user_id = req.session.userid;
  let addmoney = Number(req.body.money);
  if (addmoney <= 0) {
    res.status(400).render("addmoney", {
      error: "invalid input"
    });
  } else {
    dbClient.query("SELECT * FROM finance_overview WHERE user_id = $1 AND symbol='CASH'", [user_id], function(dbError, dbResponse) {
      let oldmoney = Number(dbResponse.rows[0].total);
      let newmoney = oldmoney + addmoney;
      dbClient.query("UPDATE finance_overview SET total = $1 WHERE user_id = $2 AND symbol = 'CASH'", [newmoney, user_id], function(dbError, dbResponse) {
        res.render("account", {
          success: "Money has been added"
        });
      });
    });
  }
});

app.get("/logout", function(req, res) {
  req.session.destroy(function(err) {
    console.log("Session destroyed.");
  });
  res.render("login", {
    success: "You have been logged out"
  });
});


app.listen(PORT, function() {
  console.log(`MI Finance running and listening on port ${PORT}`);
});
