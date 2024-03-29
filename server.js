const fs = require('fs');
const cp = require('child_process')
const app = require("express")();
app.use(require("body-parser").json());

process.on(`unhandledRejection`, console.error);
process.on(`uncaughtException`, console.error)

global.streamCache = {};

global.sendPings = (process.argv.indexOf(`debug`) !== -1 || process.argv.indexOf(`--fallback`) !== -1 || require('./config.json').debug) ? false : true;

console.log(`sendPings: ${global.sendPings}`)

if(fs.existsSync(`./etc/`)) {
    const subdirs = fs.readdirSync(`./etc/`).filter(entry => fs.existsSync(`./etc/${entry}/`) && !entry.endsWith(`yt-dlp`));
    console.log(`${subdirs.length} subdirectories found! (${subdirs.join(`, `) || `--`})`)
    for(i of subdirs) {
        fs.rmSync(`./etc/${i}/`, {
            recursive: true,
        });
    };

    for(j of fs.readdirSync(`./etc/`).filter(f => f.endsWith(`.json`))) {
        fs.rmSync(`./etc/${j}`)
    }

    if(fs.existsSync(`./etc/yt-dlp`) && !fs.existsSync(`./etc/yt-dlp/`)) fs.rmSync(`./etc/yt-dlp`)
}

const update = () => new Promise((res, rej) => {
    console.log(`Checking for updates...`)
    if(global.sendPings) {
        cp.exec(`git reset --hard`, (err, out, stderr) => {
            if(!err) {
                cp.exec(`git pull`, (err, out, stderr) => {
                    if(err) {
                        console.warn(`Unable to pull files!`, err); res()
                    } else if(!`${out}`.toLowerCase().includes(`already up to date`)) {
                        console.log(`Updates were made; successfully pulled files -- rebuilding node_modules!`);

                        let update = false;

                        let main = process.argv.indexOf(`main`) !== -1 ? true : false

                        if(`${out}`.includes(`server.js`) || `${out}`.includes(`package.json`)) {
                            update = true
                        } else if(main && `${out}`.includes(`main.js`)) {
                            update = true
                        } else if(!main && (`${out}`.includes(`func/`) || `${out}`.includes(`lib/`) || `${out}`.includes(`util.js`) || `${out}`.includes(`getKeys.js`) || `${out}`.includes(`core.js`))) {
                            update = true
                        }

                        if(update) cp.exec(`npm i`, (e, out, stderr) => {
                            if(!err) {
                                console.log(`Successfully rebuilt node_modules! Restarting...`);
                                process.exit(0);
                            } else {
                                console.error(`Error occurred while rebuilding node_modules: ${e ? e : `-- no output --`}`, e);
                            }
                        })
                    } else {
                        console.log(`Up to date!`)
                        res()
                    }
                })
            }
        })
    } else res(console.log(`Did not fetch updates -- sendPings is disabled`))
});

update().then(() => {
    setInterval(update, 60000);

    if(!fs.existsSync(`config.json`)) {
        console.log(`make a config.json file, or rename config.json.example`);
        process.exit(1)
    } else {
        const auth = require('./config.json').authKey;
        
        app.use((req, res, next) => {
            const started = Date.now();

            res.origSend = res.send; res.send = (o) => {
                if(typeof o == `object`) o.timeTaken = Date.now() - started;
                res.origSend(o)
            }

            if(global.sendPings) {
                const valid = (req.headers.auth || req.headers.authorization || req.headers.authentication || req.query.auth || req.query.key) == auth;
                if(!req.originalUrl.includes(`registerMusic`)) console.log(`ENDPOINT REQUESTED: ${req.path}; AUTHORIZATION KEY IS ${(req.headers.auth || req.headers.authorization || req.headers.authentication || req.params.auth || req.params.key)}, BEING ${valid ? `VALID.` : `INVALID.`}`);
                if(valid) delete (req.headers.auth || req.headers.authorization || req.headers.authentication || req.query.auth || req.query.key);
                if(valid) {
                    delete req.query.auth;
                    delete req.query.key;
                }
                if(valid) {next()} else return res.status(401).send(`u forgot auth :)`)
            } else {
                if(!req.originalUrl.includes(`registerMusic`)) console.log(`authorization not necessary; debug mode is enabled!`);
                next();
            }
        });

        require(process.argv.indexOf(`main`) !== -1 ? `./main` : `./node`)({
            app,
            auth,
        });
    }
})