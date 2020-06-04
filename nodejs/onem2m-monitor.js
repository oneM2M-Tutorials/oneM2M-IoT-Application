	// Version 1.0

var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var config = require('config');
var app = express();
const argv = require('yargs')
	.command({
		command: 'commandActuator <command> <actuator>', 
		description: 'Force a command on the given actuator',
		builder: (yargs) => yargs
	})
	.command({
		command: 'getAll <sensor>', 
		description: 'Get all data from the given sensor',
		builder: (yargs) => yargs
	})
	.command({
		command: 'getLatest <sensor>', 
		description: 'Get latest data from the given sensor',
		builder: (yargs) => yargs
	})
	.option('sensor', {
		alias: 's',
		description: 'Sensor to be monitored',
		type: 'String',
		choices: ['Luminosity', 'Tilt'],
		default: 'Luminosity'
	})
	.usage('Usage: $0 -s [sensor] -a [actuator]')
	.option('actuator', {
		alias: 'a',
		description: 'Actuator to be triggered',
		type: 'String',
		choices: ['Led'],
		default: 'Led'
	})
	.help()
    .alias('help', 'h')
    .argv;
	
///////////////Parameters/////////////////
//CSE Params
var csePoA = "http://" + config.cse.ip + ":" + config.cse.port;
var cseName = config.cse.name;
var cseRelease = config.cse.release;
//AE params
var monitorId = config.monitor.id;
var monitorIP = config.monitor.ip;
var monitorPort = config.monitor.port;
var body;
var sensorOffState = 1;
var requestNr = 0;

console.log(argv);

var sensorToMonitor = argv.sensor+"Sensor";
var actuatorToTrigger = argv.actuator+"Actuator";

console.log("");
console.log("Sensor to be monitored: "+sensorToMonitor+", Actuator to trigger: "+actuatorToTrigger);
console.log("");

var sensorOffState = 1;
var isLedOn = false;
var luminosityThreshold = 0;

if(sensorToMonitor == "LuminositySensor"){
	luminosityThreshold = 400;
} else if (sensorToMonitor == "TiltSensor"){
	sensorOffState = 1;
}

if(actuatorToTrigger == "LedActuator"){
	isLedOn = false;
} 

//////////////////////////////////////////

app.use(bodyParser.json({type : ['application/*+json','application/json']}));


if (argv._.includes('commandActuator')) {
	createContentInstance("["+argv.command+"]");
} else if (argv._.includes('getAll')) {
	getAll(sensorToMonitor);
} else if (argv._.includes('getLatest')) {
	getLatest(sensorToMonitor);
} else {

	// start http server
	app.listen(monitorPort, function () {
	console.log("Listening on: " + monitorIP + ":" + monitorPort);
	});

	// handle received http messages
	app.post('/', function (req, res) {
		var  vrq  = req.body["m2m:sgn"]["m2m:vrq"];
		if  (!vrq) {
			var sensorValue = req.body["m2m:sgn"].nev.rep["m2m:cin"].con;
			console.log("Receieved sensor value : " + sensorValue);
			if((sensorToMonitor == "LuminositySensor")&&(actuatorToTrigger == "LedActuator")){
				commandLedLuminosity(sensorValue);
			} else if((sensorToMonitor == "TiltSensor")&&(actuatorToTrigger == "LedActuator")){
				commandLedTilt(sensorValue);
			} else {
				console.log("Demo not implemented");
			} 
		}
		res.set('X-M2M-RSC', 2000)
		if(cseRelease != "1") {
			res.set('X-M2M-RVI', cseRelease)
		}
	
		res.status(200);
		res.send();
	});

createAE();
}
function commandLedTilt(sensorValue) {
	if(sensorValue == sensorOffState && isLedOn ){
		console.log("Tilt deactivated => Switch Off the led");
		createContentInstance("[switchOff]");
		isLedOn=false;
	} else if(sensorValue != sensorOffState && !isLedOn){
		console.log("Tilt activated => Switch On the led");
		createContentInstance("[switchOn]")
		isLedOn=true;
	}else{
		console.log("Nothing to do");
	}
}

function commandLedLuminosity(sensorValue) {
	if(sensorValue>500 && isLedOn ){
		console.log("High luminosity => Switch led OFF");
		createContentInstance("[switchOff]");
		isLedOn=false;
	}else if(sensorValue<=500 && !isLedOn){
		console.log("Low luminosity => Switch led ON");
		createContentInstance("[switchOn]")
		isLedOn=true;
	}else{
		console.log("Nothing to do");
	}
}


function createAE(){
	
	var options = {
		uri: csePoA+"/"+cseName,
		method: "POST",
		headers: {
			"X-M2M-Origin": monitorId,
			"X-M2M-RI": "req"+requestNr,
			"Content-Type": "application/vnd.onem2m-res+json;ty=2"
		},
		json: { 
			"m2m:ae":{
				"rn":"MONITOR",			
				"api":"app.company.com",
				"rr":true,
				"poa":["http://"+monitorIP+":"+monitorPort+"/"]
			}
		}
	};

	console.log("");
	console.log(options.method + " " + options.uri);
	console.log(options.json);

	if(cseRelease != "1") {
		options.headers = Object.assign(options.headers, {"X-M2M-RVI":cseRelease});
		options.json["m2m:ae"] = Object.assign(options.json["m2m:ae"], {"srv":[cseRelease]});
	}
	
	requestNr += 1;
	request(options, function (err, resp, body) {
		if(err){
			console.log("AE Creation error : " + err);
		} else {
			console.log("AE Creation :" + resp.statusCode);
			createSubscription();
		}
	});
}


function createSubscription(){
	var options = {
		uri: csePoA + "/" + cseName + "/" + sensorToMonitor + "/DATA",
		method: "POST",
		headers: {
			"X-M2M-Origin": monitorId,
			"X-M2M-RI": "req"+requestNr,
			"Content-Type": "application/vnd.onem2m-res+json;ty=23"
		},
		json: {
			"m2m:sub": {
				"rn": "SUB_MONITOR",
				"nu": [monitorId],
				"nct": 2,//In theory, this value in combination with net=3 is N/A, nct=1(default) is ok
				"enc": {
					"net": [3]
				}
			}
		}
	};

	console.log("");
	console.log(options.method + " " + options.uri);
	console.log(options.json);

	if(cseRelease != "1") {
		options.headers = Object.assign(options.headers, {"X-M2M-RVI":cseRelease});
	}
	
	requestNr += 1;
	request(options, function (err, resp, body) {
		if(err){
			console.log("SUB Creation error : " + err);
		}else{
			console.log("SUB Creation : " + resp.statusCode);
		}
	});
}

function createContentInstance(commandName){
	var options = {
		uri: csePoA + "/" + cseName + "/" + actuatorToTrigger + "/COMMAND",
		method: "POST",
		headers: {
			"X-M2M-Origin": monitorId,
			"X-M2M-RI": "req"+requestNr,
			"Content-Type": "application/vnd.onem2m-res+json;ty=4"
		},
		json: {
			"m2m:cin":{
					"con": commandName
				}
			}
	};

	console.log("");
	console.log(options.method + " " + options.uri);
	console.log(options.json);

	if(cseRelease != "1") {
		options.headers = Object.assign(options.headers, {"X-M2M-RVI":cseRelease});
	}
	
	requestNr += 1;
	request(options, function (err, resp, body) {
		if(err){
			console.log("CIN Creation error : " + err);
		}else{
			console.log("CIN Creation : " + resp.statusCode);
		}
	});
}

function getAll() {
	var options = {
		uri: csePoA+"/"+cseName + "/" + sensorToMonitor + "/DATA" + "?rcn=4",
		method: "GET",
		headers: {
			"X-M2M-Origin": monitorId,
			"X-M2M-RI": "req"+requestNr,
			"Accept": "application/vnd.onem2m-res+json"
		},
		json: true
	};

	console.log("");
	console.log(options.method + " " + options.uri);
	
	if(cseRelease != "1") {
		options.headers = Object.assign(options.headers, {"X-M2M-RVI":cseRelease});
	}
	
	requestNr += 1;
	console.log("Sending request >>> ");
	console.log(options.method + " " + options.uri);

	request(options, function (err, resp, body) {
		console.log("\n\n<<< Response received ! ");
		if(err) {
			console.log("Error = " + err);
		} else {
			console.log("Response Status Code = " + resp.statusCode);
			console.log("Response Body = " + resp.body);

			if(resp.statusCode == 200){
				console.log("\n\nEffective content of CINs = ");
				body["m2m:cnt"]["m2m:cin"].forEach(elt => {
					console.log(elt.con);				
				});
			}
		}
	});
};

function getLatest() {
	var options = {
		uri: csePoA+"/"+cseName + "/" + sensorToMonitor + "/DATA" + "/la",
		method: "GET",
		headers: {
			"X-M2M-Origin": monitorId,
			"X-M2M-RI": "req"+requestNr,
			"Accept": "application/vnd.onem2m-res+json"
		},
		json: true
	};

	console.log("");
	console.log(options.method + " " + options.uri);
	
	if(cseRelease != "1") {
		options.headers = Object.assign(options.headers, {"X-M2M-RVI":cseRelease});
	}
	
	requestNr += 1;
	console.log("Sending request >>> ");
	console.log(options.method + " " + options.uri);

	request(options, function (err, resp, body) {
		console.log("\n\n<<< Response received ! ");
		if(err) {
			console.log("Error = " + err);
		} else {
			console.log("Response Status Code = " + resp.statusCode);
			console.log("Response Body = " + body);

			console.log("\n\nEffective content of CIN = " + body["m2m:cin"].con);
		}
	});
};
