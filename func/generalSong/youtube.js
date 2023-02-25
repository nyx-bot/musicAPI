const searchFunc = ({query, duration}) => new Promise(async (res, rej) => {
    let ytsres, err = [], i = 0

    while(i < 3 && !ytsres) {
        i++
        console.log(`[generalSong/YT] attempt #${i} for ${query}`);
        ytsres = await require("yt-search")({
            query,
            pageStart: 1,
            pageEnd: 1,
        }).catch(e => {err.push(e)})
    };

    if(ytsres && ytsres.videos && ytsres.videos.length > 0) {
        const parsed = ytsres.videos.filter(v => 
            typeof v == `object` && 
            v.type.toLowerCase() == `video` && 
            (duration ? require('../../util').timestampStringToNum(v.timestamp) < duration+3000 : true) && 
            (duration ? require('../../util').timestampStringToNum(v.timestamp) > duration-10000 : true)
        ).map(resp => { 
            return {
                title: resp.title,
                artists: [resp.author.name],
                duration: [resp.seconds * 1000],
                url: resp.url,
                thumbnail: `https://i3.ytimg.com/vi/${resp.videoId}/maxresdefault.jpg`,
                id: resp.videoId,
                source: `YouTube`,
                from: `yt`,
            }
        });

        console.log(`[generalSong/YT] Found ${ytsres.videos.length} results, filtered down to ${parsed.length}`);

        res(parsed)
    } else {
        res([])
    }
});

module.exports = ({
    title, artist, duration, keys
}) => new Promise(async res => {
    let search = [ `${title}` ];

    if(artist) {
        if(typeof artist == `object` && artist.length) {
            artist.forEach(a => {
                if(a.includes(` `)) {
                    search.unshift(`${a} ${title}`)
                    search.unshift(`"${a}" ${title}`)
                    search.push(...a.split(` `).map(ar => `${ar} ${title}`))
                } else {
                    search.unshift(`${a} ${title}`)
                    search.unshift(`"${a}" ${title}`)
                }
            })
        } else {
            if(artist.includes(` `)) {
                search.unshift(`${artist} ${title}`)
                search.unshift(`"${artist}" ${title}`)
                search.push(...artist.split(` `).map(a => `${a} ${title}`))
            } else {
                search.unshift(`${artist} ${title}`)
                search.unshift(`"${artist}" ${title}`)
            }
        }
    };

    console.log(`[generalSong/YT] Searching ${search.length} queries`, search);

    let results = await Promise.all([
        ...search.map(q => new Promise(async res => {
            console.log(`[generalSong/YT] searching for ${q}...`);
            searchFunc({query: q, duration: require(`../../util`).time(duration).units.ms}).then(r => {
                console.log(`[generalSong/YT] found ${r.length} results`);
                res(r)
            })
        }))
    ]);

    console.log(results)

    return res(results)
})