
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
  , exec = require('child_process').exec;


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
//if (path.existsSync("db/parser.db")) // or fs.existsSync
//define db
var db = require('sqlite-wrapper')('db/parser.db'); 

//prime the database
db.createTable('user_table',{
	'id': {
		type: 'INTEGER',
		primary: true,
		notnull: true
	},
	'ip': {
		type: 'TEXT'
	},
	'agent': {
		type: 'TEXT'
	},
	'url': {
		type: 'TEXT'
	},
	'referrer': {
		type: 'TEXT'
	},
	'mobile': {
		type: 'INTEGER'
	}
});

db.createTable('data_table', {
	'user_ip': {
		type: 'TEXT'
	},
	'keyword': {
		type: 'TEXT'
	}
});

//clean the database
//exec("sqlite3 parser.db 'drop table data_table; drop table user_table;' && sqlite3 parser.db '.read parser.sql'");

//records array to insert into the db
var userRecords = new Array();
var dataRecords = new Array();
var excludedKeywords = ['http','com','net','www','html','php','iframepull','iframe','stitial','section','adframe']

//setup event listeners
radium.on('convertDone', defineData);
radium.on('dataDone', insertRecords);

console.time('parse');
console.time('load-file');
fs.readFile('data/parsed_data.txt', { encoding: 'utf8'}, function(err,contents) {
	console.timeEnd('load-file');
	if (!err) {
		//console.log(contents.replace(/\n/g,',' ));
		
		/**
		* Data Cleaning Regular Expressions
		* Match Blank Field -> /^\w*: (?=\n)/ ( and replace with '--')
		* Match label and space -> /^\w*: / ( and replace with '')
		* Match eol -> /\n/  (and replace with comma)
		* Match ,****,****, -> /,\**,\**,/ (and replace with new line)
		* Match ****, or ,**** -> \*{4},|,\*{4} (and replace with '')
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
					ip: parts[0],
					agent: parts[1],
					url: parts[2],
					referrer: parts[3],
					mobile: mobile
				};
				userRecords.push(record);
			}
		
			if (index == array.length -1) {
				console.timeEnd('convert-file');
				radium.emit('convertDone');
			}
		});
	}
});


function defineData() {
	console.time('data-parse');
	userRecords.forEach(function(record,index, array) {
		//match any group of letters (with 3 ore more characters) that follow either a slash/dash/underscore/or dot
		var matches = record.url.match(/(?=\/|-|_|)[a-z]{3,}/ig); 
		if (matches) {
			matches.forEach(function(match) {
				if(excludedKeywords.indexOf(match) == -1){
					//console.log(match);
					var dataRecord = {
						user_ip: record.ip,
						keyword: match
					};
					dataRecords.push(dataRecord);
				}
			});
		}
		if (index == array.length -1) {
			console.timeEnd('data-parse');
			radium.emit('dataDone');
		}
	});
}



function insertRecords() {
	console.log('keywords found: ' + dataRecords.length);
	
	console.time('user-db-write');
	userRecords.forEach(function(record,index,array) {
		db.insert('user_table',record)
		if (index == array.length -1 )
			console.timeEnd('user-db-write');
	});
	
	console.time('data-db-write');
	db.insertAll('data_table',dataRecords, function() {
		console.timeEnd('data-db-write');
	});
	
}
