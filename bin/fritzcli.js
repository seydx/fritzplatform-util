#!/usr/bin/env node
const inquirer = require('inquirer');
const tr = require('@seydx/tr064');
const storage = require('node-persist');
const program = require('caporal');
const packageFile = require('./../package.json');
const chalk = require('chalk');
const clear = require('clear');
const figlet = require('figlet');
const self = this;

clear();
console.log(
  chalk.yellow(
    figlet.textSync('Fritz!', { horizontalLayout: 'full' })
  )
);

console.log('\nFritz!Platform Debug Tool v%s',packageFile.version);
console.log('by SeydX (https://github.com/SeydX)\n');

storage.initSync({
  dir: __dirname + '/'
});

this.questions = [
  {
    type: 'input',
    name: 'host',
    message: 'IP Addresse:',
    validate: function(value) {
      var pass = value.match(
        /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      );
      if (pass) {
        return true;
      }
      return 'Please enter a valid ip addresse';
    }
  },
  {
    type: 'input',
    name: 'port',
    message: 'Port (49000):',
    validate: function(value) {
      var valid = !isNaN(parseFloat(value));
      return valid || 'Please enter a valid port';
    },
    filter: Number
  },
  {
    type: 'input',
    name: 'username',
    message: 'Username:',
  },
  {
    type: 'password',
    message: 'Password:',
    name: 'password',
    mask: '*'
  },
  {
    type: 'input',
    name: 'timeout',
    message: 'Timeout(s):',
    validate: function(value) {
      var valid = !isNaN(parseFloat(value));
      return valid || 'Please enter a valid timeout';
    },
    filter: Number
  },
  {
    type: 'confirm',
    name: 'ssl',
    message: 'Encrypted connection (SSL)?',
    default: true
  }
];

this.services = [
  {
    type: 'list',
    name: 'service',
    message: 'Select the service you want to debug:',
    paginated: true,
    pageSize: 15,
    choices: []
  }
];

this.actions = [
  {
    type: 'list',
    name: 'action',
    message: 'Select the action you want to debug:',
    paginated: false,
    choices: []
  }
];

this.storedDevices = [
  {
    type: 'list',
    name: 'device',
    message: 'Please select a device:',
    paginated: false,
    choices: storage.keys()
  }
];

if(this.storedDevices[0].choices.length)this.storedDevices[0].choices.push('Back');

this.choiceAction = [
  {
    type: 'list',
    name: 'action',
    message: 'What you want to do?',
    paginated: false,
    choices: storage.keys().length ? ['Debug','Add new device','Show stored credentials','Remove credentials'] : ['Add new device']
  }
];

this.setValue = [];

program
  .version('0.0.1')
  .command('start', 'Start debugging tool')
  .action((args, options, logger) => { 
    logger.info('Welcome to Fritz!Platform debugging tool.\n'); 
    mainMenu(logger,'Start');
  });
  
program.parse(process.argv);
  
function mainMenu(logger){
  logger.info('Main menu');
  inquirer.prompt(self.choiceAction).then(answers => {
    if(answers.action=='Debug'){
      debug(logger);
    } else if(answers.action=='Add new device'){
      addDevice(logger);
    } else if(answers.action=='Show stored credentials'){
      showCredentials(logger);
    } else {
      removeCredentials(logger);
    }
  });
}

function debug(logger){
  inquirer.prompt(self.storedDevices).then(answers => {
    if(answers.device!='Back'){
      loginTR064(storage.getItem(answers.device),logger,false);
    }else{
      mainMenu(logger);  
    }
  });
}

function addDevice(logger){
  inquirer.prompt(self.questions).then(answers => {
    answers.timeout = answers.timeout*1000;
    loginTR064(answers,logger,true);
  });
}

function showCredentials(logger){
  inquirer.prompt(self.storedDevices).then(answers => {
    if(answers.device!='Back'){
      logger.info('\nCredentials:'); 
      logger.info(storage.getItem(answers.device));
      logger.info('');
      mainMenu(logger);
    } else {
      mainMenu(logger);  
    }
  });
}

function removeCredentials(logger){
  inquirer.prompt(self.storedDevices).then(answers => {
    if(answers.device!='Back'){
      logger.info(storage.removeItem(answers.device));
      logger.info('Credentials removed!\n');
    } else {
      mainMenu(logger);  
    }
  });
}

function loginTR064(config,logger,store){
  self.tr064 = new tr.TR064(config);
  self.tr064.initDevice('TR064')
    .then(result => {
      if(store){ 
        logger.info('\nCredentials saved into storage!\n');
        storage.setItem(result.meta.friendlyName,config);
        mainMenu(logger);
      }
      logger.info('\nDevice initialized: ' + result.meta.friendlyName); 
  
      if(config.ssl){
        result.startEncryptedCommunication()
          .then(sslDev => {
            sslDev.login(config.username,config.password);
            logger.info('Encrypted communication started with: %s \n',result.meta.friendlyName);
            selectService(sslDev, logger);
          })
          .catch(err => {
            logger.error('An error occured by starting encypted communication with: %s \n',result.meta.friendlyName);
            logger.error(err);
            logger.info('');
          });
      } else {
        logger.info('Communication started with: %s \n',result.meta.friendlyName); 
        if(store){
          logger.info('Credentials saved into storage!\n');
          storage.setItem(result.meta.friendlyName,config);
        }
        selectService(result, logger);
      }

    })
    .catch(err => {
      logger.error('An error occured by initializing device!\n');
      logger.error(err);
      logger.info('');
    });

}

function selectService(device, logger){
  self.services[0].choices = [];
  self.services[0].choices = device.meta.servicesInfo;
  if(!self.services[0].choices.includes('Back'))self.services[0].choices.push('Back');

  inquirer.prompt(self.services).then(answers => {
    if(answers.service!='Back'){
      selectAction(device,answers.service, logger);
    } else {
      debug(logger);
    }
  });
}

function selectAction(device, service, logger){
  self.actions[0].choices = [];
  for(const i of Object.keys(device.services)){
    if(service == i){
      for(const j in device.services[i].meta.actionsInfo){
        self.actions[0].choices.push(device.services[i].meta.actionsInfo[j].name);
      }
    }
  }
  if(!self.actions[0].choices.includes('Back'))self.actions[0].choices.push('Back');
  inquirer.prompt(self.actions).then(answers => {
    if(answers.action!='Back'){
      startDebug(device,service, answers.action, logger);
    } else {
      selectService(device, logger);
    }
  });
}

function checkInArgs(device, service, action){

  let array = [];

  for(const i of Object.keys(device.services)){
    if(service == i){
      for(const j in device.services[i].meta.actionsInfo){
        if(device.services[i].meta.actionsInfo[j].name == action){
          array.push(device.services[i].meta.actionsInfo[j]);
        }
      }
    }
  }

  return array[0].inArgs;

}

function checkOutArgs(device, service, action){

  let array = [];

  for(const i of Object.keys(device.services)){
    if(service == i){
      for(const j in device.services[i].meta.actionsInfo){
        if(device.services[i].meta.actionsInfo[j].name == action){
          array.push(device.services[i].meta.actionsInfo[j]);
        }
      }
    }
  }

  return array[0].outArgs;

}

function startDebug(device, service, action, logger){

  let inArgs = checkInArgs(device, service, action);
  let outArgs = checkOutArgs(device, service, action);

  let debugService = device.services[service];

  if(!inArgs.length&&!outArgs.length){
    logger.info('\nDebugging %s', action);
    debugService.actions[action](function(err, res){
      if(!err){
        logger.info('\nSuccessed! [' + service + '] [' + action + ']');
        logger.info(res);
        logger.info('');
      } else {
        logger.error('\nAn error occured [' + service + '] [' + action + ']');
        logger.error(err);
        logger.info('');
      }
      //selectService(device, logger)
      selectAction(device,service,logger);
    });
  } else if(!inArgs.length&&outArgs.length){
    logger.info('\nDebugging %s', action);
    debugService.actions[action](function(err, res){
      if(!err){
        logger.info('\nSuccessed! [' + service + '] [' + action + ']');
        logger.info(res);
        logger.info('');
      } else {
        logger.error('\nAn error occured [' + service + '] [' + action + ']');
        logger.error(err);
        logger.info('');
      }
      //selectService(device, logger)
      selectAction(device,service,logger);
    });
  } else {
    logger.info('\nDebugging %s', action);
    let setArgs = [];
  
    for(const i of inArgs){
  
      let valName = i.split('New')[1];
  
      self.setValue.push({
        type: 'input',
        name: i,
        message: valName+':'
      });
    }
  
    inquirer.prompt(self.setValue).then(answers => {
      for(const i of Object.keys(answers)){
        setArgs.push({name:i,value:answers[i]});
      }
      
      debugService.actions[action](setArgs,function(err, res){
        if(!err){
          logger.info('\nSuccessed! [' + service + '] [' + action + ']');
          logger.info(res);
          logger.info('');
        } else {
          logger.error('\nAn error occured [' + service + '] [' + action + ']');
          logger.error(err);
          logger.info('');
        }
        //selectService(device, logger)
        selectAction(device,service,logger);
      });
      
    });
  
  }

}

process.stdin.on("data", (key) => {
  if (key == "\u0003") {
    console.log("\nBye bye\n");
  }
});
