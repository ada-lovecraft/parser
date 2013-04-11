
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , url = require('url')
  , EventEmitter = require('events').EventEmitter
  , radium = new EventEmitter()
  , fs  = require("fs")
  , sys = require('sys')
  , exec = require('child_process').exec
  , sqlite = require('sqlite3')
  , clc = require('cli-color');


var shouldCreateNewObject = true;
var currentObject = {};


var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);




http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});


/*** INITIAL PARSING ***/
//if the database doesn't exist, parse everything

if (!path.existsSync("db/parser.db")) { 
	//clean the database

	//records arrays to insert into the db
	var userRecords = new Array();
	var dataRecords = new Array();
	//keywords to exclude
	var excludedKeywords = ['http','com','net','www','html','php','iframepull','iframe','stitial','section','adframe']

	//setup event listeners
	radium.on('convertDone', defineData);
	radium.on('dataDone', insertRecords);

	console.time('total-parse-time');
	console.time('load-file');

	fs.readFile('data/parsed_data.txt', { encoding: 'utf8'}, function(err,contents) {
		console.timeEnd('load-file');
		if (!err) {
			
			/**
			* Data Cleaning Regular Expressions
			* Match Blank Field -> /^\w*: (?=\n)/ ( and replace with '--') 
			* Match label and space -> /^\w*: / ( and replace with '')
			* Match eol -> /\n/  (and replace with 3 commas comma)
			* Match ,,,****,****, -> /,\**,\**,/ (and replace with new line)
			* Match ****,,, or ,,,**** -> \*{4},,,|,,,\*{4} (and replace with '')
			**/
			console.time('convert-file');
			var parsed = contents.replace(/^\w*: (?=\n)/gm,'--').replace(/^\w*: /gm,'').replace(/\n/gm,',,,').replace(/,\**,\**,,,/g,'\n').replace(/\*{4},,,|,,,\*{4}/g,'');
			var lines = parsed.split('\n');
			console.log('total lines found: ' + lines.length);
			fs.writeFile('data/parsed.txt', parsed );
			lines.forEach(function(line,index,array) {
				var parts = line.split(',,,');

				if (parts[1]) {
					var mobileMatches = parts[1].match(/mobile/g);

					var mobile = mobile ? true : false;
					var record = {
						$ip: parts[0],
						$agent: parts[1],
						$url: parts[2],
						$referrer: parts[3],
						$mobile: mobile
					};
					userRecords.push(record);
				}
			
				if (index == array.length -1) {
					console.timeEnd('convert-file');
					radium.emit('convertDone');
				}
			});
		} else {
			console.log(clc.redBright.bold('ERROR LOADING FILE: ') + error);
		}
	});
}

function defineData() {
	console.time('keyword-parse');
	userRecords.forEach(function(record,index, array) {
		//match any group of letters (with 3 ore more characters) that follow either a slash/dash/underscore
		var matches = record.$url.match(/(?=\/|-|_|)[a-z]{3,}/ig); 
		if (matches) {
			matches.forEach(function(match) {
				if(excludedKeywords.indexOf(match) == -1){
					//console.log(match);
					var dataRecord = {
						$user_ip: record.$ip,
						$keyword: match
					};
					dataRecords.push(dataRecord);
				}
			});
		}
		if (index == array.length -1) {
			console.timeEnd('keyword-parse');
			console.log('keywords found: ' + dataRecords.length);
			console.timeEnd('total-parse-time');
			radium.emit('dataDone');
		}
	});
}



function insertRecords() {

	var sqlite3 = require('sqlite3').verbose(); 
	var db = new sqlite3.cached.Database('data/parser.db');
	var percentTitle = 'User Insertion: ';
	var lastPercent = 0;
	var userLength = userRecords.length;
	var dataLength = dataRecords.length;
	
	db.serialize(function() {
		console.log('creating keyword table....');
		db.run('CREATE TABLE "data_table" ("user_ip" INTEGER NOT NULL,"keyword" TEXT NOT NULL);', function(err) {
			console.log('data_table created');
		});
		console.log('creating user table....');
		db.run('CREATE TABLE "user_table" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,"ip" TEXT,"agent" TEXT,"url" TEXT,"referrer" TEXT,"mobile" INTEGER DEFAULT 0);', function(err) {
			console.log('user_table created');
		})
		db.parallelize(function() {
			console.log('inserting data...');
			
			console.time('user-db-write');
			userRecords.forEach(function(record,index,array) {
				db.run('INSERT into user_table(ip,agent,url, referrer, mobile) values($ip,$agent,$url,$referrer,$mobile)',record, function(err) {
					if (err) {
						console.log(clc.redBright.bold('ERROR INSERTING INTO USER TABLE: ') + err);
					} else {
						if (index == array.length -1 ) {
							console.timeEnd('user-db-write');	
							percent = 100;
						} else {
							percent = Math.floor((index / userLength)*100);
						}
						if (percent != lastPercent ) {
							lastPercent = percent;
							console.log(percentTitle + lastPercent + '%');
						}
					}
				});
			});
			
			percentTitle = "Data Insertion: ";
			console.time('data-db-write');
			dataRecords.forEach(function(record,index,array) {
				db.run('INSERT into data_table(user_ip,keyword) values($user_ip,$keyword)',record, function(err) {
					if (err) {
						console.log(clc.redBright.bold('ERROR INSERTING INTO KEYWORD TABLE: ') + err);
					} else {
						if (index == array.length -1 ) {
							console.timeEnd('data-db-write');	
							percent = 100;
						} else {
							percent = Math.floor((index / dataLength)*100);
						}
						if (percent != lastPercent ) {
							lastPercent = percent;
							console.log(percentTitle + lastPercent + '%');
						}
					}
				});
			});
		});
	});
}
