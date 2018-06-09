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
    paginated: false,
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
    message: 'Select the device you want to debug:',
    paginated: false,
    choices: storage.keys()
  }
];

this.setValue = [];

program
  .version('0.0.1')
  .command('start', 'Start debugging tool')
  .action((args, options, logger) => { 
    if(storage.keys().length){
      inquirer.prompt(self.storedDevices).then(answers => {
        loginTR064(storage.getItem(answers.device),logger,false);
      });
    } else {
      inquirer.prompt(self.questions).then(answers => {
        answers.timeout = answers.timeout*1000;
        loginTR064(answers,logger,true);
      });
    }
  })
  .command('add', 'Start debugging tool')
  .action((args, options, logger) => { 
    inquirer.prompt(self.questions).then(answers => {
      answers.timeout = answers.timeout*1000;
      loginTR064(answers,logger,true);
    });
  })
  .command('credentials', 'Show stored credentials')
  .action((args, options, logger) => {
    if(storage.keys().length){
      inquirer.prompt(self.storedDevices).then(answers => {
        logger.info('\nCredentials:'); 
        logger.info(storage.getItem(answers.device));
        logger.info('');
      });
    } else {
      logger.info('No credentials in storage!\n');
    }
  })
  .command('remove', 'Remove credentials from storage')
  .action((args, options, logger) => {
    if(storage.keys().length){
      inquirer.prompt(self.storedDevices).then(answers => {
        logger.info(storage.removeItem(answers.device));
        logger.info('Credentials removed!\n');
      });
    } else {
      logger.info('No credentials in storage!\n');
    }
  });

function loginTR064(config,logger,store){
  self.tr064 = new tr.TR064(config);
  self.tr064.initDevice('TR064')
    .then(result => {
  
      logger.info('\nDevice initialized: ' + result.meta.friendlyName); 
  
      if(config.ssl){
        result.startEncryptedCommunication()
          .then(sslDev => {
            sslDev.login(config.username,config.password);
            logger.info('Encrypted communication started with: %s \n',result.meta.friendlyName);
            if(store){ 
              logger.info('Credentials saved into storage!\n');
              storage.setItem(result.meta.friendlyName,config);
            }
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
      logger.error('An error occured by initializing device, trying again...\n');
      logger.error(err);
      logger.info('');
    });

}

function selectService(device, logger){

  self.services[0].choices = device.meta.servicesInfo;

  inquirer.prompt(self.services).then(answers => {
    selectAction(device,answers.service, logger);
  });
}

function selectAction(device, service, logger){
  for(const i of Object.keys(device.services)){
    if(service == i){
      for(const j in device.services[i].meta.actionsInfo){
        self.actions[0].choices.push(device.services[i].meta.actionsInfo[j].name);
      }
    }
  }
  inquirer.prompt(self.actions).then(answers => {
    startDebug(device,service, answers.action, logger);
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
    logger.info('\n[NO ARGS] Debugging %s', action);
    debugService.actions[action](function(err, res){
      if(!err){
        logger.info('\nSuccessed! [' + action + ']');
        logger.info(res);
        logger.info('');
      } else {
        logger.error('\nAn error occured [' + action + ']');
        logger.error(err);
        logger.info('');
      }
    });
  } else if(!inArgs.length&&outArgs.length){
    logger.info('\n[OUT ARGS] Debugging %s', action);
    debugService.actions[action](function(err, res){
      if(!err){
        logger.info('\nSuccessed! [' + action + ']');
        logger.info(res);
        logger.info('');
      } else {
        logger.error('\nAn error occured [' + action + ']');
        logger.error(err);
        logger.info('');
      }
    });
  } else {
    logger.info('\n[IN OUT ARGS] Debugging %s', action);
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
          logger.info('\nSuccessed! [' + action + ']');
          logger.info(res);
          logger.info('');
        } else {
          logger.error('\nAn error occured [' + action + ']');
          logger.error(err);
          logger.info('');
        }
      });
      
    });
  
  }

}

program.parse(process.argv);
