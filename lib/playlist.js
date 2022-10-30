module.exports = {
     endpoint: `/playlist/:arg(*+)`,
     func: async ({keys, idGen}, req, response) => {
          let q = req.params.arg;
          let entries = Object.entries(req.query)
          for(i in entries) {
               console.log(i)
               let ext = entries[i]
               let a = `&`; if(`${i}` == `0`) {a = '?'}
               q = q + a + ext[0];
               if(ext[1] !== '') {q = q + `=${ext[1]}`}
          }
          const args = q.split("/");
          let url = unescape(args.slice(1).join('/'));
          let obj = {query: url, name: null, description: null, results: []};
          console.log(args[0].toLowerCase())
          if(args[0].toLowerCase() == `youtube`) { // pl
               obj.source = `YouTube`;
               let lists = {videos: []};
               if(url.includes(`list=`)) {
                    url = url.split('list=')[1].split('&')[0].split('?')[0]
               };
               url = `https://www.youtube.com/playlist?list=${url}`;
               obj.url = url
               console.log(url)
               let attempt = 0;
               while (attempt !== 3 && (!lists || !lists.items || lists.items.length === 0)) {
                    attempt++;
                    console.log(`attempt to search #${attempt}`);
                    try {
                         lists = await require('ytpl')(url, {limit: Infinity})
                    } catch(e) {
                         try {
                              lists = await require('ytpl')(url, {limit: Infinity})
                         } catch(e) {
                              try {
                                   lists = await require('ytpl')(url, {limit: Infinity})
                              } catch(e) {
                                   console.log(`${e}`)
                              }
                         }
                    }
               }
               if (!lists || !lists.items || lists.items.length === 0) return response.send(obj);
               obj.name = lists.title
               obj.description = lists.description;
               obj.thumbnail = lists.thumbnails && lists.thumbnails.length > 0 && lists.thumbnails[0] && lists.thumbnails[0].url ? `${lists.thumbnails[0].url}` : `https://i.nyxbot.gg/null.png`
               obj.owner = {
                    thumbnail: lists.author.bestAvatar.url,
                    name: lists.author.name
               }
               obj.type = `playlist`
               obj.totalduration = 0;
               for (i in lists.items) {
                    let video = lists.items[i];
                    obj.results.push({
                         title: video.title,
                         artists: [video.author.name],
                         duration: [video.durationSec*1000],
                         url: `https://www.youtube.com/watch?v=${video.id}`,
                         live: video.isLive ? true : false,
                         thumbnail: `https://i3.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
                         id: video.id,
                         source: `YouTube`,
                    });
                    obj.totalduration = obj.totalduration + video.durationSec*1000
               }
               response.send(obj)
          } else if(args[0].toLowerCase() == `soundcloud`) {
               if(!url.includes(`/sets/`)) return response.send(obj)
               obj.source = `SoundCloud`;
               obj.url = url.replace(':/soundcloud', '://soundcloud');
               require('superagent').get(`https://api-v2.soundcloud.com/resolve?url=${(url.replace(':/soundcloud', '://soundcloud'))}&client_id=${keys.sc}`).then(r => r.body).then(async r => {
                    require('superagent').get(`https://api-v2.soundcloud.com/playlists/${r.id}?client_id=${keys.sc}`).then(r => r.body).then(async r => {
                         obj.name = r.title
                         obj.description = r.description;
                         obj.thumbnail = r.artwork_url || `https://i.nyxbot.gg/null.png`;
                         obj.owner = {
                              thumbnail: r.user.avatar_url,
                              name: r.user.username
                         }
                         obj.type = r.is_album ? `album` : `set`
                         obj.totalduration = 0;
                         let ids = Object.entries(r.tracks).map(key => [key[1].id]);
                         let raw = [];
                         let newIds = [];
                         for(id in ids) { id = ids[id]
                              if(raw.length === 30) {
                                   newIds.push(raw);
                                   raw = [];
                              } else {
                                   raw.push(id)
                              }
                         }
                         if(raw.length !== 0) {newIds.push(raw); raw = []};
                         let lists = [];
                         while(newIds.length !== 0) {
                              try {
                                   let r;
                                   try {
                                        r = await require('superagent').get(`https://api-v2.soundcloud.com/tracks?ids=${newIds.shift().join(`%2C`)}&client_id=${keys.sc}`).then(r => r.body);
                                   } catch(e) {
                                        try {
                                             r = await require('superagent').get(`https://api-v2.soundcloud.com/tracks?ids=${newIds.shift().join(`%2C`)}&client_id=${keys.sc}`).then(r => r.body);
                                        } catch(e) {
                                             try {
                                                  r = await require('superagent').get(`https://api-v2.soundcloud.com/tracks?ids=${newIds.shift().join(`%2C`)}&client_id=${keys.sc}`).then(r => r.body);
                                             } catch(e) {r = []}
                                        }
                                   }
                                   lists.push(...r);
                              } catch(e) {}
                         };
                         for(song in lists) { song = lists[song];
                              let dur = [song.duration];
                              if(song.duration !== song.full_duration) {dur.push(song.full_duration)}
                              let object = {
                                   title: song.title,
                                   artists: [song.user.username],
                                   duration: dur,
                                   url: song.permalink_url,
                                   live: false,
                                   id: song.id,
                                   source: `SoundCloud`,
                              };
                              if(song.artwork_url) {
                                   object.thumbnail = song.artwork_url.replace('-large.jpg', '-t500x500.jpg')
                              }
                              obj.results.push(object);
                              obj.totalduration = obj.totalduration + song.duration
                         };
                         return response.send(obj);
                    }).catch(e => {console.error(e); return response.send(obj)})
               }).catch(e => {console.error(e); return response.send(obj)})
          } else if(args[0].toLowerCase() == `spotify`) {
               obj.source = `Spotify`;
               if(url.includes(`open.spotify.com/playlist/`)) url = (url.split('playlist/')[1]).split('?')[0].split('/')[0];
               if(url.includes(`open.spotify.com/album/`)) url = (url.split('album/')[1]).split('?')[0].split('/')[0];
               console.log(url);
               obj.url = `https://open.spotify.com/playlist/${url}`
               let playlist;
               let attempt = 0;
               
               playlist = await new Promise(res => {
                    keys.clients.spotify.playlists.get(url, true).then(r => {
                         obj.type = `playlist`;
                         if(!r) {
                              throw new Error(`there was no info returned!`)
                         } else res(r)
                    }).catch(e => {
                         console.log(e)
                         keys.clients.spotify.albums.get(url, true).then(r => {
                              obj.type = `album`;
                              if(!r) {
                                   throw new Error(`there was no info returned!`)
                              } else {
                                   r.description = `Album by ${r.artists[0].name}`
                                   res(r)
                              }
                         }).catch(e => {
                              console.log(e)
                              obj.type = `Spotify URL`
                              return res(null)
                         });
                    });
               }); obj.url = `https://open.spotify.com/${obj.type}/${url}`
               
               if (!playlist) {obj.error = `Unable to fetch the playlist's details`; return response.send(obj);}
               obj.name = playlist.name
               obj.description = playlist.description;
               obj.thumbnail = playlist.images.length > 0 && playlist.images[0] && playlist.images[0].url ? `${playlist.images[0].url}` : `https://i.nyxbot.gg/null.png`,
               obj.owner = {
                    thumbnail: `https://i.nyxbot.gg/null.png`, // spotify doesn't give a proper avatar URL
                    name: (playlist.artists ? (playlist.artists[0].name) : (playlist.owner.display_name))
               }
               obj.totalduration = 0;
          
               console.log(playlist, playlist.tracks, playlist.tracks.items)
               console.log(`${playlist.tracks.items.length} / ${playlist.tracks.total} taken!`)
          
               let tracks = playlist.tracks.items.slice(0);
          
               while (playlist.tracks.next) {
                    await new Promise(res => setTimeout(res, 400))
                    var nextSetOfTracks = await keys.clients.spotify.utils.fetch({
                         link: playlist.tracks.next.replace('https://api.spotify.com/', '')
                    });
                    tracks.push(...nextSetOfTracks.items);
                    delete nextSetOfTracks.items;
                    playlist.tracks = nextSetOfTracks;
                    console.log(`${tracks.length} / ${playlist.tracks.total} taken!`)
               }
          
               /* if(obj.type == `Playlist`) {
                    tracks = await spotify.playlists.getTracks(url, {limit: 1000});
                    tracks = tracks.filter(t => !t.track.is_local)
               } else if(obj.type == `Album`) {
                    tracks = await spotify.albums.getTracks(url, {limit: 1000});
               } else {
                    {obj.error = `Unable to fetch the playlist's details`; return response.send(obj);}
               }; */
          
               if(tracks.length === 0) {obj.error = `Unable to fetch the playlist's tracks`; return response.send(obj);}
               if(obj.type == `album`) {
                    for (i in tracks) {
                         let track = tracks[i];
                         obj.results.push({
                              title: track.name,
                              artists: track.artists.map(a => a.name),
                              duration: [track.duration],
                              url: track.externalUrls.spotify,
                              live: false,
                              thumbnail: playlist.images[0].url,
                              id: track.id,
                              source: `Spotify`,
                         });
                         obj.totalduration = obj.totalduration + track.duration_ms
                    }
               } else {
                    for (i in tracks) {
                         let track = tracks[i].track;
			 let thumb;
			 if(!thumb && track.album && track.album.images && typeof track.album.images[0] == `object` && track.album.images[0].url) thumb = track.album.images[0].url;
			 if(!thumb) {
			       thumb = `https://i.nyxbot.gg/null.png`
			       console.log(`track "${track.name}" does not have an album image... (array of images length: ${track.album.images.length}`)
			 }
                         obj.results.push({
                              title: track.name,
                              artists: track.artists.map(a => a.name || a.id),
                              duration: [track.duration],
                              url: track.externalUrls.spotify,
                              thumbnail: thumb,
                              id: track.id,
                              source: `Spotify`,
                         });
                         obj.totalduration = obj.totalduration + track.duration_ms
                    }
               }
               response.send(obj)
          }
     }
}
