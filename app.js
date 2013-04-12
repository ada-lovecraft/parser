
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
  , levelup = require('levelup')
  , fs = require('fs')
  , clc = require('cli-color')
  , idgen = require('idgen');




console.time('total-time');
var shouldCreateNewObject = true;
var currentObject = {};


var app = express();
var db;

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

//clean the database

//records arrays to insert into the db
var userRecords = new Array();
var keywordRecords = new Array();
var allRecords = new Array();
//keywords to exclude
var excludedKeywords = ['http','com','net','www','html','php','iframepull','iframe','stitial','section','adframe']

//setup event listeners
radium.on('convertDone', defineData);
radium.on('dataDone', insertRecords);
radium.on('dbDone', dbDone);

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

				var mobile = mobileMatches ? true : false;
				var record = {
					type: 'put',
					key: idgen(20) ,
					value: {
						ip: parts[0],
						agent: parts[1],
						url: parts[2],
						referrer: parts[3],
						mobile: mobile
					}
				};
				userRecords.push(record);
			}
		
			if (index == array.length -1) {
				console.timeEnd('convert-file');
				console.log('Users Found: '  + userRecords.length);
				radium.emit('convertDone');
			}
		});
	} else {
		console.log(clc.redBright.bold('ERROR LOADING FILE: ') + error);
	}
});


function defineData() {
	console.time('keyword-parse');
	userRecords.forEach(function(record,index, array) {
		allRecords.push(record);
		//match any group of letters (with 3 ore more characters) that follow either a slash/dash/underscore
		var matches = record.value.url.match(/(?=\/|-|_|)[a-z]{4,}/ig); 
		if (matches) {
			matches.forEach(function(match) {
				if(excludedKeywords.indexOf(match) == -1){
					//console.log(match);
					var dataRecord = {
						type: 'put',
						key: match + "|" + record.key,
						value: {
							keyword: match,
							uid: record.id
						}
					};
					keywordRecords.push(dataRecord);
					allRecords.push(dataRecord);
				}
			});
		} 
		if (index == array.length -1) {
			console.timeEnd('keyword-parse');
			console.log('keywords found: ' + keywordRecords.length);
			console.timeEnd('total-parse-time');
			radium.emit('dataDone');
		}
	});
}



function insertRecords() {

	var userLength = userRecords.length;
	var keywordLength = keywordRecords.length;
	db = levelup('data/parsedb');
	
	console.time('preparing-db');
	db.on('ready',function() {
		console.timeEnd('preparing-db');
		console.time('writing-db');
		db.batch(allRecords, function(err) {
			if(err) 
				console.log(clc.redBright.bold('[User] OOOPS: ') + err);
			else {
				console.timeEnd('writing-db');
				radium.emit('dbDone');
			}
		});
	});
}

function dbDone() {
	console.timeEnd('total-time');
	var opts = {
		
	}
	db.readStream(opts).on('data', function(data) {

        if (quiet === true && !data.key && (!data.value || data.key)) {
          cachedkeys.push(data.key || data);
        }

        if (quiet === false) {
          write(JSON.stringify(data));
        }

      })
	db.createReadStream()
		.on('data', function(data) {
			console.log(data.key + ' :: ' + data.value);
		})
}
