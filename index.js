#! /usr/bin/env node
import prompts from 'prompts';
import chalk from 'chalk';
import shell from 'shelljs';
import {spawn} from 'child_process';
import { Spinner } from 'cli-spinner';
import { Client, Databases, Functions, ID, Permission, Role, Storage, Teams, InputFile } from 'node-appwrite';
import { readFile, writeFile } from 'fs/promises';
import webpush from 'web-push';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const l = console.log;
const br = () => console.log('\n');

let spinner;

async function main() {
  l(chalk.white('create-chat-app will bootstrap a chat community which you can host anywhere you\'d like.'));

  let depsPass = true;

  if (shell.which('git')) {
    l(
      chalk.greenBright('✔'),
      'Git is installed.'
    );
  }
  else {
    l(
      chalk.redBright('✘'),
      'Git is not installed.'
    );
    depsPass = false;
  }

  if (!depsPass) {
    console.log(
      chalk.white('Please install the missing dependencies above and run'),
      chalk.bgWhiteBright('npx create-chat-app'),
      chalk.white('again.')
    );
    return;
  }
  else {
    console.log(
      chalk.white('All required dependencies are present.')
    );
  }

  const {title} = await prompts({
    type: 'text',
    name: 'title',
    message: 'What is your community called?',
    validate: (v) => v.length > 0
  });

  const folder = title.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`'"~()]/g, '').replace(/\s/g, '-');

  const {projectId} = await prompts({
    type: 'text',
    name: 'projectId',
    message: 'Please enter your Appwrite project ID:'
  });

  const {apiKey} = await prompts({
    type: 'password',
    name: 'apiKey',
    message: 'Please enter your Appwrite API key:'
  });

  const {speechlyAppId} = await prompts({
    type: 'text',
    name: 'speechlyAppId',
    message: 'Please enter your Speechly app ID:'
  });

  const {adminEmail} = await prompts({
    type: 'text',
    name: 'adminEmail',
    message: 'Please enter the email for the first admin account (probably your own):',
    validate: (v) => v.toLowerCase().match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
  });

  br();

  l(
    chalk.white('This tool will now:\n'),
    `1. Clone create-chat-app-client into ${chalk.underline(folder)}\n`,
    `2. Install dependencies via npm\n`,
    `3. Create required database on Appwrite\n`,
    `4. Create required storage buckets on Appwrite\n`,
    `5. Deploy required functions on Appwrite\n`,
    `6. Register ${adminEmail} as the first admin user\n`,
    `7. Populate your client's configuration file`,
  );

  br();

  const {doIt} = await prompts({
    type: 'confirm',
    name: 'doIt',
    message: `Create ${title}?`
  });

  if (!doIt) {
    console.log('Okay, bye! 👋');
    return;
  }

  br();

  await exec(
    `%s [1/7] Cloning create-chat-app client into ./${folder}...`,
    `git clone git@github.com:saricden/create-chat-app-client.git ${folder} --quiet`
  );

  shell.cd(folder);
  shell.exec('git remote rm origin');
  shell.cd('..');

  await exec(
    '%s [2/7] Installing dependencies via npm...',
    `cd ${folder} && npm install --silent`
  );

  startSpinner('%s [3/7] Creating database on Appwrite... ');

  const client = new Client();
  const dbs = new Databases(client);
  const storage = new Storage(client);
  const functions = new Functions(client);
  const teams = new Teams(client);

  client.setEndpoint('https://cloud.appwrite.io/v1');
  client.setProject(projectId);
  client.setKey(apiKey);

  await dbs.create('chat', 'chat');

  await Promise.all([
    dbs.createCollection('chat', 'users', 'users', [
      Permission.create(Role.users()),
      Permission.read(Role.users()),

      Permission.create(Role.team('admin')),
      Permission.read(Role.team('admin')),
      Permission.update(Role.team('admin'))
    ], false),

    dbs.createCollection('chat', 'profiles', 'profiles', [
      Permission.create(Role.users()),
      Permission.read(Role.users()),

      Permission.create(Role.team('admin')),
      Permission.read(Role.team('admin')),
      Permission.update(Role.team('admin'))
    ], true),

    dbs.createCollection('chat', 'channels', 'channels', [
      Permission.read(Role.users()),

      Permission.create(Role.team('admin')),
      Permission.read(Role.team('admin')),
      Permission.update(Role.team('admin'))
    ], false),

    dbs.createCollection('chat', 'messages', 'messages', [
      Permission.create(Role.users()),
      Permission.read(Role.users()),

      Permission.create(Role.team('admin')),
      Permission.read(Role.team('admin')),
      Permission.update(Role.team('admin'))
    ], false),

    dbs.createCollection('chat', 'notifications', 'notifications', [ ], true)
  ]);

  await Promise.all([
    dbs.createStringAttribute('chat', 'users', 'auth_id', 30, true),
    dbs.createDatetimeAttribute('chat', 'users', 'muted_until', false),
    dbs.createBooleanAttribute('chat', 'users', 'show_admin_ui', false, false),
    
    dbs.createStringAttribute('chat', 'profiles', 'auth_id', 30, true),
    dbs.createStringAttribute('chat', 'profiles', 'username', 30, true),
    dbs.createStringAttribute('chat', 'profiles', 'avatar_id', 30, false),
    dbs.createStringAttribute('chat', 'profiles', 'bio', 500, false),
    dbs.createStringAttribute('chat', 'profiles', 'links', 250, false, undefined, true),
    dbs.createStringAttribute('chat', 'profiles', 'push_subscriptions', 500, false, undefined, true),

    dbs.createStringAttribute('chat', 'channels', 'title', 30, true),
    dbs.createStringAttribute('chat', 'channels', 'icon', 30, true),
    dbs.createStringAttribute('chat', 'channels', 'slug', 30, true),
    dbs.createBooleanAttribute('chat', 'channels', 'archived', false, false),

    dbs.createStringAttribute('chat', 'messages', 'channel_id', 30, true),
    dbs.createStringAttribute('chat', 'messages', 'message', 500, true),
    dbs.createStringAttribute('chat', 'messages', 'user_id', 30, true),
    dbs.createDatetimeAttribute('chat', 'messages', 'posted_at', true),
    dbs.createStringAttribute('chat', 'messages', 'audio_id', 30, false),
    dbs.createStringAttribute('chat', 'messages', 'tagged_user_ids', 30, false, undefined, true),
    dbs.createStringAttribute('chat', 'messages', 'from_user_avatar_url', 500, false),

    dbs.createStringAttribute('chat', 'notifications', 'for_user_id', 30, true),
    dbs.createDatetimeAttribute('chat', 'notifications', 'posted_at', true),
    dbs.createStringAttribute('chat', 'notifications', 'from_username', 30, true),
    dbs.createStringAttribute('chat', 'notifications', 'message', 500, true),
    dbs.createStringAttribute('chat', 'notifications', 'from_avatar_url', 300, false)
  ]);

  // Attributes sometimes have some latency in their availability, so we need to try/catch the following createIndex calls until they succeed
  let hasError;

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'users', 'index_1', 'key', [ 'auth_id' ], [ 'ASC' ]);
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'profiles', 'index_1', 'key', [ 'auth_id' ], [ 'ASC' ]);
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'profiles', 'index_2', 'fulltext', [ 'username' ], [ 'ASC' ]);
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'channels', 'index_1', 'key', [ 'archived' ], [ 'ASC' ]);
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'messages', 'index_1', 'key', [ 'channel_id' ], [ 'ASC' ]);
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'messages', 'index_2', 'key', [ 'posted_at' ], [ 'ASC' ]);
      break;
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'notifications', 'index_1', 'key', [ 'for_user_id', 'read' ], [ 'ASC' ]);
      break;
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  do {
    hasError = false;

    try {
      await dbs.createIndex('chat', 'notifications', 'index_2', 'key', [ 'posted_at' ], [ 'ASC' ]);
      break;
    }
    catch (e) {
      hasError = true;
      await sleep(1000);
    }
  }
  while (hasError);

  await dbs.createDocument('chat', 'channels', ID.unique(), {
    title: 'General',
    slug: 'general',
    icon: 'Home'
  });

  stopSpinner();

  startSpinner('%s [4/7] Creating storage buckets on Appwrite... ');

  await Promise.all([
    storage.createBucket('profile_pictures', 'profile_pictures', [
      Permission.read(Role.any()),

      Permission.create(Role.users()),
      Permission.read(Role.users())
    ], true),

    storage.createBucket('audio_messages', 'audio_messages', [
      Permission.read(Role.any()),
      
      Permission.create(Role.users()),
      Permission.read(Role.users())
    ], true),
  ]);

  stopSpinner();

  startSpinner('%s [5/7] Deploying Appwrite functions...');

  const keys = webpush.generateVAPIDKeys();
  const {publicKey, privateKey} = keys;

  await functions.create(
    'getVapidPublicKey',
    'getVapidPublicKey',
    'node-16.0',
    [
      Role.users()
    ]
  );

  await functions.createVariable(
    'getVapidPublicKey',
    'vapidPublicKey',
    publicKey
  );

  await functions.createDeployment(
    'getVapidPublicKey',
    'functions/getVapidPublicKey/index.js',
    InputFile.fromPath(__dirname + '/functions/getVapidPublicKey.tar.gz', 'getVapidPublicKey.tar.gz'),
    true
  );

  await functions.create(
    'watchNewMessages',
    'watchNewMessages',
    'node-16.0',
    [],
    [
      `databases.chat.collections.messages.documents.*.create`
    ]
  );

  await Promise.all([
    functions.createVariable(
      'watchNewMessages',
      'apiKey',
      apiKey
    ),
    functions.createVariable(
      'watchNewMessages',
      'vapidPublicKey',
      publicKey
    ),
    functions.createVariable(
      'watchNewMessages',
      'vapidPrivateKey',
      privateKey
    ),
    functions.createVariable(
      'watchNewMessages',
      'adminEmail',
      adminEmail
    )
  ]);

  await functions.createDeployment(
    'watchNewMessages',
    'functions/watchNewMessages/index.js',
    InputFile.fromPath(__dirname + '/functions/watchNewMessages.tar.gz', 'watchNewMessages.tar.gz'),
    true
  );

  stopSpinner();

  startSpinner(`%s [6/7] Registering ${adminEmail} as first admin user...`);

  await teams.create('admin', 'admin');

  await teams.createMembership('admin', [ 'owner' ], 'http://localhost:5146/', adminEmail);
  
  stopSpinner();

  startSpinner(`%s [7/7] Writing client configuration...`);

  let packageJSON = await readFile(`./${folder}/package.json`);

  packageJSON = JSON.parse(packageJSON);
  packageJSON['name'] = folder;

  await writeFile(`./${folder}/package.json`, JSON.stringify(packageJSON));

  const envConfig = `VITE_appwriteProjectId=${projectId}\nVITE_speechlyAppId=${speechlyAppId}\nVITE_serverName=${title}`;

  await writeFile(`./${folder}/.env.local`, envConfig);

  stopSpinner();

  br();

  l(
    `✨`,
    chalk.greenBright.underline(title),
    chalk.greenBright(`was created successfully!\n\n`),
    chalk.white(`To begin, run:\n`),
    `cd ${folder}\n`,
    `npm start\n\n`,
    chalk.white.italic(`Happy hacking!`)
  );
}

function startSpinner(msg) {
  spinner = new Spinner(msg + ' ');

  spinner.setSpinnerString(18);
  spinner.start();
}

function stopSpinner() {
  spinner.stop();
  l(chalk.greenBright('✔'), 'done.');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function exec(msg, cmd) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(cmd, {
      shell: true
    });
    
    startSpinner(msg);

    childProcess.on('exit', () => {
      stopSpinner();
      resolve();
    });

    childProcess.on('error', () => {
      stopSpinner();
      reject();
    });
  });
}

main();