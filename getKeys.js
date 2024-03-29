const fs = require('fs');
const { request } = require('http');

module.exports = (k) => new Promise(async res => {
    try {
        let keys = k || {
            clients: {}
        };
    
        keys.mainLocation = process.argv.find(s => s.startsWith(`--mainLocation=`)) ? 
            process.argv.find(s => s.startsWith(`--mainLocation=`)).split(`=`).slice(1).join(`=`) : 
            require('./config.json').mainLocation;
    
        let config;
        
        while(!config) {
            await new Promise(resolve => {
                console.log(`Fetching keys from ${keys.mainLocation}`)
                require('request').get(keys.mainLocation + `/getConfigKeys`, {
                    headers: {
                        auth: require('./config.json').authKey
                    }
                }, (e, r) => {
                    console.log(`Received keys! (Status: ${r && r.statusCode ? r.statusCode : `--`})`)
                    if(e) {
                        console.warn(`(WARNING) unable to request for config keys: ${e}`);
                    } else {
                        config = require('./config.json');
                        config.keys = r.body;
                        if(typeof config.keys == `string`) config.keys = JSON.parse(config.keys)
                    };
                    resolve()
                })
                /*superagent.get(keys.mainLocation + `/getConfigKeys`).set(`auth`, require('./config.json').authKey).then(r => {
                    console.log(`Received keys!`)
                    if(r.body && Object.keys(r.body).length > 0) {
                        config = require('./config.json');
                        config.keys = r.body
                    }; resolve()
                }).catch(e => {
                    console.warn(`(WARNING) unable to request for config keys: ${e}`); resolve()
                })*/
            })
    
            if(!config) {
                console.log(`waiting 5 seconds before trying again...`)
                await new Promise(r => setTimeout(r, 5000))
                console.log(`trying again!`)
            }
        };

        console.log(`Config loaded with ${Object.keys(config).length} keys`)
        
        const fetchKey = require(`soundcloud-key-fetch`).fetchKey
        const geniusapiold = require('genius-api');
        const geniusapi = require('genius-lyrics');

        keys.spotify = await new Promise(async res => {
            if(config && config.keys && config.keys.spotify && ((config.keys.spotify.clientID && config.keys.spotify.clientSecret) || config.keys.spotify.token)) {
                console.log(`Creating spotify`, config.keys.spotify)

                if(config.keys.spotify.token) {
                    res(config.keys.spotify.token)
                } else {
                    require('request').post({
                        url: `https://accounts.spotify.com/api/token`,
                        headers: {
                            Authorization: `Basic ${Buffer.from(`${config.keys.spotify.clientID}:${config.keys.spotify.clientSecret}`).toString(`base64`)}`
                        },
                        form: {
                            grant_type: `client_credentials`,
                        },
                        json: true
                    }, (e, resp, body) => {
                        if(e) {
                            console.log(`error`, e);
                            res(null)
                        } else if(body) {
                            console.log(`got body!`, body)
                            if(body.access_token) {
                                res(body.access_token)
                            } else res(null)
                        } else res(null)
                    })
                }
            } else {
                console.log(`Not creating spotify, no spotify key`, config)
                res(null)
            }
        })
    
        let ytdlPath;
    
        try {
            ytdlPath = `${__dirname}/etc/yt-dlp`;
    
            if(!fs.existsSync(`${__dirname}/etc/`)) fs.mkdirSync(`${__dirname}/etc`)
    
            await new Promise(async res => {
                let tmpYtdl = require(`yt-dlp-wrap`).default;
                try {
                    ytdlPath = `${__dirname}/etc/yt-dlp`;
        
                    let list = fs.readdirSync(`./etc/`).filter(s => 
                        s.startsWith(`yt-dlp`) && 
                        !s.includes(`.`) &&
                        //!ytdlPath.includes(s) && 
                        !fs.existsSync(`./etc/${s}/`)
                    )
        
                    for (existing of list) {
                        if(!existing.endsWith(`/yt-dlp`)) {
                            console.log(`Deleting yt-dlp at ${existing}`);
                            fs.rmSync(`./etc/` + existing);
                        }
                    };

                    const completeClone = () => {
                        if(!ytdlPath.endsWith(`/yt-dlp.sh`)) ytdlPath = ytdlPath += `/yt-dlp.sh`;

                        try {
                            require(`child_process`).execSync(`chmod +x "${ytdlPath}"`);
                            console.log(`[GIT] Successfully added execute permissions!`)
                        } catch(e) {
                            console.log(`[GIT] Failed adding execute permissions, yt-dlp may not work! (${e})`)
                        }

                        res()
                    }

                    const fallback = async () => {
                        console.log(`Attempting to download yt-dlp from source!`)

                        if(fs.existsSync(ytdlPath)) fs.rmSync(ytdlPath, {
                            recursive: true
                        })

                        const clone = require(`child_process`).spawn(`git`, [`clone`, `https://github.com/yt-dlp/yt-dlp`, ytdlPath]);
    
                        console.log(`Cloning yt-dlp using git!`)
    
                        clone.stdout.on(`data`, d => console.log(`[GIT] ${d.toString().trim()}`));
    
                        let handled = false;
    
                        clone.once(`close`, () => {
                            if(!handled) {
                                handled = true;
    
                                completeClone()
                            }
                        })
    
                        clone.on(`error`, async e => {
                            if(!handled) {
                                handled = true;
    
                                console.warn(`Failed to download yt-dlp source! (${e})`);
        
                                const latest = (await tmpYtdl.getGithubReleases(1))[0], assets = latest.assets;
                    
                                const latestId = latest.id
                                
                                ytdlPath = `${__dirname}/etc/yt-dlp-${latestId}`;
        
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
                            }
                        });
                    }

                    if(ytdlPath && fs.existsSync(ytdlPath)) {
                        console.log(`Existing yt-dlp repo found!`);

                        try {
                            const pull = require(`child_process`).execSync(`git pull`);

                            console.log(`[GIT] Pull success, stdout:\n[GIT] | ` + pull.toString().trim().split(`\n`).join(`\n[GIT] | `))

                            completeClone()
                        } catch(e) {
                            console.warn(`[GIT] error while pulling: ${e}`);

                            fallback()
                        }
                    } else fallback()
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
            });

            console.log(`ytdlPath: ${ytdlPath}`)
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
    } catch(e) {
        console.error(e)
    }
})