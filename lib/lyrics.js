const { parse } = require('node-html-parser');
const { htmlToText } = require('html-to-text');
const superagent = require('superagent');

module.exports = {
    endpoint: `/lyrics/:arg(*+)`,
    func: async ({keys}, req, res) => {
        let q = req.params.arg;
        let entries = Object.entries(req.query)
        for(i in entries) {
            console.log(i)
            let ext = entries[i]
            let a = `&`; if(`${i}` == `0`) {a = '?'}
            q = q + a + ext[0];
            if(ext[1] !== '') {q = q + `=${ext[1]}`}
        };

        let obj = {
            artist: ``,
            title: unescape(q),
            lyrics: ``,
        }

        await new Promise(async resolve => {
            superagent.get(`https://www.lyricsfreak.com/search.php?q=${encodeURI(q)}`).then(r => {
                const doc = parse(r.text);
                const songs = doc.querySelectorAll(`div.lf-list__row.js-sort-table-content-item`);
                const songTitles = Array.from(songs).map(s => htmlToText(s.childNodes[3].childNodes[1].rawAttrs.split(`\n`).find(n => n.includes(`title="`)).split(`title="`)[1].split(' lyrics"')[0])); 
    
                console.log(songTitles, `${songs.length} total tracks found`)
                let song = null;
                if(songs[0]) song = [songs[0]].map(s => [{
                    url: `https://www.lyricsfreak.com` + s.childNodes[3].childNodes[1].rawAttrs.split('\n').find(s => s.includes(`href="`)).match(/"([^"]+)"/)[1]
                }][0])[0]
                console.log(song)
                if(song) {superagent.get(song.url).then(r => {
                    const htmlInArray = r.text.split(`\n`);
                    const titleThingy = htmlInArray.find(s => s.includes(`lyrics | LyricsFreak</title>`));
                    let artist, title = htmlInArray.find(s => s.includes(`<meta name="description" content="`)).split(`Read or print original `)[1].split(` lyrics`)[0];
                    if(title) artist = titleThingy.split(` - ${title.split(` `)[0]}`)[0].split(`<title>`)[1];
                    obj.artist = htmlToText(artist); obj.title = htmlToText(title)
                    const doc = parse(r.text);
                    const lyrics = doc.querySelector(`#content`).childNodes.filter(l => l.rawText).map(l => {
                        let text = htmlToText(l.rawText, {wordwrap: false}).replace(/\n/g, ``).replace(/\r/g, ``).split(``).map(t => `${t}`)
                        while (text[0] == ` `) text.shift();
                        return text.join(``)
                    })
                    obj.lyrics = lyrics.join(`\n`)
                    console.log(lyrics);
                    res.send(obj);
                    resolve()
                })} else resolve()
                //console.log(songs.length, `- ` + urls.join(`\n- `))
            })
        }); if(!obj.lyrics) {
            console.log(`lyricsfreak didn't work lol, time to do genius`);
            await new Promise(async resolve => {
                try {
                    keys.clients.genius.search(unescape(q)).then(r => r.hits.filter(o => o.type == `song`)).then(async r => {console.log(r)
                        if(r.length === 0 || !r[0] || !r[0].result || !r[0].result.id) return resolve();
                        const n = unescape(q).split(` `).reverse().join(` `).split(`-`)[0].split(` `);

                        console.log(`${r.filter(s => typeof s.lyrics == `function`).length} songs have function to get lyrics`)

                        if(n[0]) r = r.filter(o => o.result.title.toLowerCase().includes(`${n[0]}`.toLowerCase()) || o.result.primary_artist.name.toLowerCase().includes(`${n[n.length-1].toLowerCase()}`));
                        if(r.length === 0 || !r[0] || !r[0].result || !r[0].result.id) {
                            console.log(`-- WAS NOT ABLE TO FIND FULLY MATCHING RESULT --`)
                            return resolve();
                        }

                        const complete = r.filter(o => o.result.lyrics_state == `complete`);
                        if(!complete[0]) console.log(`there is no results with complete lyrics..........`)
                        const song = complete[0] !== undefined && typeof complete[0] == `object` && complete[0].result ? complete[0].result : r[0].result;
                        console.log(`searched genius, ${song.title ? `title is ${song.title}` : `there is no title, however passed the missing ID check, odd.`}, and the state is ${song.lyrics_state}`);
                        console.log(song, complete[0])
                        keys.clients.genius.lyrics(song.id).then(async r => {
                            console.log(r);
                            obj.artist = r.artist.name;
                            obj.title = r.featuredTitle;
                            obj.lyrics = r.lyrics;

                            res.send(obj); resolve();
                        }).catch(e => {resolve(); console.error(e)})
                    }).catch(e => {resolve(); console.error(e)})
                } catch(e) {resolve(); console.error(e)}
            })
        }
        
        
        
        if(!obj.lyrics) {
            console.log(obj)
            console.log(`no lryics found for ${q}`)
            res.send(obj)
        }
    }
}