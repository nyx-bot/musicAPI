const fs = require('fs');
const { request } = require('http');

module.exports = (k) => new Promise(async res => {
    let keys = k || {
        clients: {}
    };

    keys.mainLocation = process.argv.find(s => s.startsWith(`--mainLocation=`)) ? 
        process.argv.find(s => s.startsWith(`--mainLocation=`)).split(`=`).slice(1).join(`=`) : 
        require('./config.json').mainLocation;

    const superagent = require('superagent');

    let config;
    
    while(!config) {
        await new Promise(resolve => {
            superagent.get(keys.mainLocation + `/getConfigKeys`).set(`auth`, require('./config.json').authKey).then(r => {
                if(r.body && Object.keys(r.body).length > 0) {
                    config = require('./config.json');
                    config.keys = r.body
                }; resolve()
            }).catch(e => {
                console.warn(`(WARNING) unable to request for config keys: ${e}`); resolve()
            })
        })

        if(!config) {
            console.log(`waiting 5 seconds before trying again...`)
            await new Promise(r => setTimeout(r, 5000))
            console.log(`trying again!`)
        }
    };

    const Spotify = require('spotify-api.js');
    const { fetchKey } = require("soundcloud-key-fetch");
    const geniusapiold = require('genius-api');
    const geniusapi = require('genius-lyrics');

    let ytdlPath;

    try {
        ytdlPath = `${__dirname}/etc/yt-dlp`;

        if(!fs.existsSync(`${__dirname}/etc/`)) fs.mkdirSync(`${__dirname}/etc`)

        await new Promise(async res => {
            let tmpYtdl = require(`yt-dlp-wrap`).default;
            try {
                const latest = (await tmpYtdl.getGithubReleases(1))[0], assets = latest.assets;
    
                const latestId = latest.id
    
                ytdlPath = `${__dirname}/etc/yt-dlp-${latestId}`;
    
                let list = fs.readdirSync(`./etc/`).filter(s => 
                    s.startsWith(`yt-dlp`) && 
                    !s.includes(`.`) &&
                    !ytdlPath.includes(s) && 
                    fs.existsSync(`./etc/${s}/`)
                )
    
                for (existing of list) {
                    console.log(`Deleting yt-dlp at ${existing}`);
                    fs.rmSync(`./etc/` + existing);
                };
    
                if(!fs.existsSync(ytdlPath)) {
                    tmpYtdl.downloadFromGithub( ytdlPath, latest.tag_name ).then(() => {
                        if(fs.existsSync(ytdlPath)) {
                            console.log(`successfully downloaded temporary binary!`)
                        } else {
                            console.log(`path has not been verified! youtube compatibility may be hindered`)
                        };
    
                        res()
                    })
                } else {
                    console.log(`Latest yt-dlp exists! (v. ${latestId})`);
                    res()
                }
            } catch(e) {
                console.warn(`Unable to finish ytdl update!`, e);

                if(ytdlPath.endsWith(`yt-dlp`)) {
                    let list = fs.readdirSync(`./etc/`).filter(s => 
                        s.startsWith(`yt-dlp`) && 
                        !s.includes(`.`) &&
                        !fs.existsSync(`./etc/${s}/`)
                    );
                    console.log(list)
                    ytdlPath = `${__dirname}/etc/${list[0]}`
                };

                res()
            }
        })
    } catch(e) {
        console.warn(`failed to download yt-dlp: ${e}`);
        
        try {
            ytdlPath = require('child_process').execSync(`which yt-dlp`).toString().replace(`\n`, ``)
        } catch(e) {
            if(`${e}`.toLowerCase().includes(`no yt-dlp in`)) {
                console.log(`\ncannot find yt-dlp binary in system path! downloading temporary binary\n\ni strongly recommend that you put a binary in your path because if this keeps happening, github may look at you funny.\n`)
            } else {
                console.log(`\nunknown error when trying to find yt-dlp binary!\n> ${e}\n\ni strongly recommend that you put a binary in your path because if this keeps happening, github may look at you funny.\n`)
            };
        }
    }
    
    const ytdl = new (require(`yt-dlp-wrap`).default)(ytdlPath);

    keys.clients.ytdl = ytdl;

    if(!fs.existsSync(`./etc/`)) fs.mkdirSync(`./etc`)

    if(fs.existsSync(`./etc/soundcloud.txt`)) {
        keys.sc = fs.readFileSync(`./etc/soundcloud.txt`).toString()
    };

    try {
        keys.sc = await fetchKey();
        fs.writeFileSync(`./etc/soundcloud.txt`, keys.sc)
        console.log(`Saved new SC key`)
    } catch(e) {console.error(e)
        try {
            keys.sc = await fetchKey();
            fs.writeFileSync(`./etc/soundcloud.txt`, keys.sc)
            console.log(`Saved new SC key`)
        } catch(e) {console.error(e)
            try {
                keys.sc = await fetchKey();
                fs.writeFileSync(`./etc/soundcloud.txt`, keys.sc)
                console.log(`Saved new SC key`)
            } catch(e) {console.error(e)}
        }
    };

    const client = await new Promise(async res => {
        setTimeout(res, 15000)

        try {
            const client = new Spotify.Client({
                token: { 
                    clientID: config.keys.spotify.clientID, 
                    clientSecret: config.keys.spotify.cllientSecret 
                },
                onReady() {
                    console.log(`Spotify connection created!`)
                    res(client)
                }
            });
        } catch(e) {
            console.error(e);
            res(null)
        }
    })

    if(client) keys.clients.spotify = client

    keys.genius = config.keys.genius

    const oldGeniusClient = new geniusapiold(keys.genius)
    const LyricsClient = new geniusapi.Client(keys.genius)

    keys.clients.genius = oldGeniusClient

    //keys.clients.genius.search = newGeniusClient.songs.search
    keys.clients.genius.lyrics = (songId) => new Promise(async (res, rej) => {
        LyricsClient.songs.get(songId).then(r => {
            console.log(`song fetched;`);
            if(r && r.lyrics && typeof r.lyrics == `function`) {
                console.log(`lyrics function exists!`);
                r.lyrics().then(lyr => {
                    res({...r, lyrics: lyr})
                })
            } else {
                console.error(`lyrics function for ${songId} does not exist; object:`, r);
                rej(new Error(`no lyrics function`, r))
            }
        })
    })
    //genius.lyrics = (...args) => lyricist.song(...args, {fetchLyrics: true})

    //keys.clients.genius = genius

    console.log(`Updated keys: ${Object.entries(keys).length - 1} keys registered, ${Object.entries(keys.clients).length} clients initiated.`);
    res(keys)
})