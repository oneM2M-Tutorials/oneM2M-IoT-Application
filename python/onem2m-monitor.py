# Version 1.1

import requests
import json
from flask import Flask
from flask import request
from flask import Response
import sys
import random
import configparser

#/////////////// Parameters /////////////////
config = configparser.ConfigParser()
with open('default.json', 'r') as f:
    config = json.load(f)
# CSE Params
csePoA = "http://" + config["cse"]["ip"] + ":" + str(config["cse"]["port"])
cseName = config["cse"]["name"]
cseRelease = config["cse"]["release"]
poa_in_nu = config["cse"]["poa_in_nu"]
# AE params
monitorId = config["monitor"]["id"]
monitorIP = config["monitor"]["ip"]
monitorPort = config["monitor"]["port"]
monitorPoA = "http://" + monitorIP + ":" + str(monitorPort)

sensorOffState = config["TiltSensor"]["sensorOffState"]
luminosityThreshold = config["LuminositySensor"]["luminosityThreshold"]
isLedOn = config["LedActuator"]["isLedOn"]
requestNr = 0

sensorToMonitor = ""
actuatorToTrigger = ""

def createSUB():
    global requestNr
    global cseRelease
    global poa_in_nu
    headers = {
                    'Content-Type': 'application/json;ty=23',
                    'X-M2M-Origin': monitorId,
                    "X-M2M-RI": "req" + str(requestNr),
                }

    if(cseRelease != "1"):
        headers.update({"X-M2M-RVI":cseRelease})

    notificationUri = [cseName + "/Monitor"]
    if(poa_in_nu):
    	notificationUri = [monitorPoA]

    response = requests.post(csePoA + '/' + cseName + "/" + sensorToMonitor + '/DATA',
                json={
                    "m2m:sub": {
                        "rn": "SUB_Monitor",
                        "nu": notificationUri,
                        "nct": 1,
                        "enc": {
                            "net": [3]
                        }
                    }
                }, 
                headers=headers
                )
    requestNr += 1
    if response.status_code != 201:
        print("SUB Creation error : ", response.text)
    else:
        print("SUB Creation :" , response.status_code)

def createAE():
    global requestNr
    global cseRelease
    headers = {
                    'Content-Type': 'application/json;ty=2',
                    'X-M2M-Origin': monitorId,
                    "X-M2M-RI": "req" + str(requestNr),
                }
    ae_json={
			"m2m:ae":{
					"rn": "Monitor", 
					"api":"Norg.demo.monitor-app",
					"rr":True,
					"poa":[ monitorPoA ]
				}
			}
    if(cseRelease != "1"):
        headers.update({"X-M2M-RVI":cseRelease})
        ae_json['m2m:ae'].update({"srv":[cseRelease]})

    response = requests.post(csePoA + "/" + cseName,
                json=ae_json,
                headers= headers
                )
    requestNr += 1
    if response.status_code != 201:
        print("AE Creation error : ", response.text)
    else:
        print("AE Creation :", response.status_code)
    createSUB()

def createCIN(commandName):
    global requestNr
    global cseRelease
    headers = {
                    'Content-Type': 'application/json;ty=4',
                    'X-M2M-Origin': monitorId,
                    "X-M2M-RI": "req" + str(requestNr),
                }

    if (cseRelease != "1"):
        headers.update({"X-M2M-RVI": cseRelease})

    response = requests.post(csePoA + "/" + cseName + "/" + actuatorToTrigger + '/COMMAND',
                json={
                    "m2m:cin": {
                        "con": commandName
                    }
                }, 
                headers=headers
                )
    requestNr += 1
    if response.status_code != 201:
        print("CIN Creation error : ", response.text)
    else:
        print("CIN Creation :", response.status_code)


api = Flask(__name__)

@api.route('/', methods=['POST'])
def processNotification():
    global isLedOn
    notificationJSON = request.json
    sensorValue = int(notificationJSON['m2m:sgn']['nev']['rep']['m2m:cin']['con'])
    print("Receieved sensor value : ", sensorValue)
    if (sensorToMonitor == "LuminositySensor") and (actuatorToTrigger == "LedActuator"):
        commandLedLuminosity(sensorValue)
    elif (sensorToMonitor == "TiltSensor") and (actuatorToTrigger == "LedActuator"):
        commandLedTilt(sensorValue)
    else:
        print("Demo not implemented")
    response = Response('')
    response.headers["X-M2M-RSC"] = 2000
    if (cseRelease != "1"):
        response.headers["X-M2M-RVI"] = cseRelease
    return response

def commandLedLuminosity(sensorValue):
    global isLedOn
    if (sensorValue > luminosityThreshold) and (isLedOn == True):
        print("High luminosity => Switch led OFF")
        createCIN("[switchOff]")
        isLedOn = False
    elif (sensorValue < luminosityThreshold) and (isLedOn == False):
        print("Low luminosity => Switch led ON")
        createCIN("[switchOn]")
        isLedOn = True
    else:
        print("Nothing to do")

def commandLedTilt(sensorValue):
    global isLedOn
    if (sensorValue == sensorOffState) and (isLedOn == True) :
        print ( "Tilt deactivated => Switch Off the led")
        createCIN("[switchOff]")
        isLedOn = False
    elif (sensorValue != sensorOffState) and (isLedOn == False) :
        print("Tilt activated => Switch On the led")
        createCIN("[switchOn]")
        isLedOn = True
    else:
        print("Nothing to do")

def commandActuator(args):
    global actuatorToTrigger
    requestNr = random.randint(0,1000)
    print("The command " + args.command + " will be sent to the actuator " + args.actuator)
    actuatorToTrigger = args.actuator +"Actuator"
    createCIN("[" + args.command + "]")
    sys.exit()

def getAll(args):
    global requestNr
    global cseRelease

    requestNr = random.randint(0,1000)
    print("Sending request >>> ")
    headers = {
        'X-M2M-Origin': monitorId,
        "X-M2M-RI": "req" + str(requestNr),
        'Accept': 'application/json'
    }
    if (cseRelease != "1"):
        headers.update({"X-M2M-RVI": cseRelease})

    response = requests.get(csePoA + "/" + cseName + "/" + args.sensor + "Sensor/DATA" +  '?rcn=4',
                            headers=headers)

    print("<<< Response received ! ")

    if response.status_code != 200:
        print("Error = ", response.text)
    else:
        print("Effective content of CINs = ")
        contentInstanceInJSON = json.loads(response.content)
        for elt in contentInstanceInJSON['m2m:cnt']['m2m:cin']:
            print("   " + elt['con'])

    sys.exit()

def getLatest(args):
    global requestNr
    global cseRelease
    requestNr = random.randint(0,1000)
    print("Sending request >>> ")
    headers = {
        'X-M2M-Origin': monitorId,
        "X-M2M-RI": "req" + str(requestNr),
        'Accept': 'application/json'
    }
    if (cseRelease != "1"):
        headers.update({"X-M2M-RVI": cseRelease})

    response = requests.get(csePoA + "/" + cseName + "/" + args.sensor + "Sensor/DATA/la",
                            headers=headers)

    requestNr += 1
    print("<<< Response received ! ")

    if response.status_code != 200:
        print("Error = ", response.text)
    else:
        cin = json.loads(response.content)
        print("Effective content of CIN = ", cin['m2m:cin']['con'])

    sys.exit()

def getParameters():
   import argparse
   global sensorToMonitor, actuatorToTrigger

   #Command-line parsing
   parser = argparse.ArgumentParser()
   parser.add_argument("-s","--sensor", choices=["Luminosity", "Tilt"], default="Luminosity", help='Sensor to be monitored')
   parser.add_argument("-a","--actuator", choices=["Led"],default="Led", help='Actuator to trigger')

   #Subcommands command-line parsing
   subparsers = parser.add_subparsers(required=False, help="Subcommands")
   #"commandActuator"
   parser_commandActuator = subparsers.add_parser("commandActuator", help="Force a command on the given actuator")
   parser_commandActuator.add_argument('command', help='Given command')
   parser_commandActuator.add_argument("-a","--actuator", choices=["Led"],default="Led", help='Given actuator')
   parser_commandActuator.set_defaults(func=commandActuator)
   #"getAll"
   parser_getAll = subparsers.add_parser("getAll", help="Get all data from the given sensor")
   parser_getAll.add_argument('-s',"--sensor", choices=["Luminosity", "Tilt"], default="Luminosity", help='Given sensor')
   parser_getAll.set_defaults(func=getAll)
   #"getLatest"
   parser_getLatest = subparsers.add_parser("getLatest", help="Get latest data from the given sensor")
   parser_getLatest.add_argument('-s', "--sensor", choices=["Luminosity", "Tilt"], default="Luminosity", help='Given sensor')
   parser_getLatest.set_defaults(func=getLatest)

   args = parser.parse_args()

   print(args)

   sensorToMonitor = args.sensor + "Sensor"
   actuatorToTrigger = args.actuator + "Actuator"

   if args.__contains__("func"):
    args.func(args)

if __name__ == '__main__':
    getParameters()

    if(sensorToMonitor == "LuminositySensor"):
        luminosityThreshold = 400
    elif sensorToMonitor == "TiltSensor":
        sensorOffState = 1

    if (actuatorToTrigger == "LedActuator"):
        isLedOn = False

    createAE()
    api.run(host=monitorIP, port=monitorPort)
