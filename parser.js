/**
 * This is the file where commands get parsed.
 *
 * Modified by DaWoblefet for use with BoTTT III with original work by TalkTakesTime, Quinella, and Morfent.
 *
 * Some parts of this code are taken from the Pokémon Showdown server code, so
 * credits also go to Guangcong Luo and other Pokémon Showdown contributors.
 * https://github.com/Zarel/Pokemon-Showdown
 *
 * @license MIT license
 */

const { inspect } = require("util");
const https = require("https");
const url = require("url");

const ACTION_COOLDOWN = 3*1000;
const FLOOD_MESSAGE_NUM = 5;
const FLOOD_PER_MSG_MIN = 500; //This is the minimum time between messages for legitimate spam. It's used to determine what "flooding" is caused by lag
const FLOOD_MESSAGE_TIME = 6*1000;
const MIN_CAPS_LENGTH = 18;
const MIN_CAPS_PROPORTION = 0.8;

const NONE = 0;
const VOICE = 1;
const DRIVER = 2;
const MODERATOR = 3;
const BOT = 4;
const LEADER = 5;
const ROOMOWNER = 6;
const ADMIN = 7;

let ranks = " +%@*&#~";
let rankMap = new Map();
for (let i = 0, len = ranks.length; i < len; i++)
{
	rankMap.set(ranks.charAt(i), i);
}

settings = {};
try
{
	settings = JSON.parse(fs.readFileSync("settings.json"));
	if (!Object.keys(settings).length && settings !== {}) settings = {};
}
catch (e) {} //File doesn't exist [yet]

exports.parse =
{
	actionUrl: url.parse("https://play.pokemonshowdown.com/~~" + config.serverid + "/action.php"),
	room: "lobby",
	"settings": settings,
	chatData: {},
	ranks: {},
	msgQueue: [],

	data: function(data, connection)
	{
		if (data.substr(0, 1) === 'a')
		{
			data = JSON.parse(data.substr(1));
			if (data instanceof Array)
			{
				for (let i = 0, len = data.length; i < len; i++)
				{
					this.splitMessage(data[i], connection);
				}
			}
			else
			{
				this.splitMessage(data, connection);
			}
		}
	},
	splitMessage: function(message, connection)
	{
		if (!message) return;

		let room = "lobby";
		if (message.indexOf("\n") < 0) return this.message(message, connection, room);

		let spl = message.split("\n");
		if (spl[0].charAt(0) === '>')
		{
			if (spl[1].substr(1, 4) === "init")
			{
				return ok("joined " + spl[2].substr(7));
			}
			//Edge case for tour end
			try
			{
				if (spl[2].substr(1, 10) === "tournament")
				{
					return this.message(spl[2], connection, room);
				}
			}
			catch (e) {}
			if (spl[1].substr(1, 10) === "tournament")
			{
				return this.message(spl[1], connection, room);
			}
			room = spl.shift().substr(1);
		}

		for (let i = 0, len = spl.length; i < len; i++)
		{
			this.message(spl[i], connection, room);
		}
	},

	/*Showdown chat messages are handled by sending a string with data separated by the | character.
	Read more here: https://github.com/Zarel/Pokemon-Showdown/blob/167dce1ca67a1530449c0c777df8a5312f65fe26/PROTOCOL.md
	*/

	message: function(message, connection, room)
	{
		//console.log(message);
		let spl = message.split('|');
		let by; //The user sending the message
		switch (spl[1])
		{
			case "challstr":
				info("received challstr, logging in...");
				let id = spl[2];
				let str = spl[3];

				let requestOptions =
				{
					hostname: this.actionUrl.hostname,
					port: this.actionUrl.port,
					path: this.actionUrl.pathname,
					agent: false
				};

				let data = "";
				if (!config.pass)
				{
					requestOptions.method = "GET";
					requestOptions.path += "?act=getassertion&userid=" + toID(config.nick) + "&challengekeyid=" + id + "&challenge=" + str;
				}
				else
				{
					requestOptions.method = "POST";
					data = "act=login&name=" + config.nick + "&pass=" + config.pass + "&challengekeyid=" + id + "&challenge=" + str;
					requestOptions.headers =
					{
						"Content-Type": "application/x-www-form-urlencoded",
						"Content-Length": data.length
					};
				}

				let req = https.request(requestOptions, function(res)
				{
					res.setEncoding("utf8");
					data = "";
					res.on("data", function(chunk)
					{
						data += chunk;
					});
					res.on("end", function()
					{
						if (data === ';')
						{
							error("failed to log in; nick is registered - invalid or no password given");
							process.exit(-1);
						}
						if (data.length < 50)
						{
							error("failed to log in: " + data);
							process.exit(-1);
						}

						if (data.indexOf("heavy load") !== -1)
						{
							error("the login server is under heavy load; trying again in one minute");
							setTimeout(function()
							{
								this.message(message);
							}.bind(this), 60 * 1000);
							return;
						}

						if (data.substr(0, 16) === "<!DOCTYPE html>")
						{
							error("Connection error 522; trying again in one minute");
							setTimeout(function()
							{
								this.message(message);
							}.bind(this), 60 * 1000);
							return;
						}

						try
						{
							data = JSON.parse(data.substr(1));
							if (data.actionsuccess)
							{
								data = data.assertion;
							}
							else
							{
								error("could not log in; action was not successful: " + JSON.stringify(data));
								process.exit(-1);
							}
						}
						catch (e) {}
						send(connection, "|/trn " + config.nick + ",0," + data);
					}.bind(this));
				}.bind(this));

				req.on("error", function(err)
				{
					error("login error: " + inspect(err));
				});

				if (data) req.write(data);
				req.end();
				break;
			case "updateuser":
				if (spl[2] !== config.nick) return;

				if (spl[3] !== '1')
				{
					error("failed to log in, still guest");
					process.exit(-1);
				}

				ok("logged in as " + spl[2]);
				this.say(connection, room, "/avatar " + config.avatar);

				//Joining the rooms
				for (let i = 0, len = config.rooms.length; i < len; i++)
				{
					let room = config.rooms[i];
					if (room === "lobby" && config.serverid === "showdown") continue; //Policy is to not auto-join lobby
					this.msgQueue.push("|/join " + room);
				}
				for (let i = 0, len = config.privaterooms.length; i < len; i++)
				{
					let room = config.privaterooms[i];
					if (room === "lobby" && config.serverid === "showdown") continue; //Policy is to not auto-join lobby
					this.msgQueue.push("|/join " + room);
				}
				this.msgDequeue = setInterval(function ()
				{
					let msg = this.msgQueue.shift();
					if (msg)
					{
						return send(connection, msg);
					}
					clearInterval(this.msgDequeue);
					this.msgDequeue = null;
				}.bind(this), 750);
				break;
			case 'c': //Dev messages, punishments, global stuff
				by = spl[2];
				this.chatMessage(spl[3], by, room, connection);
				break;
			case "c:": //Normal chat
				by = spl[3];
				this.processChatData(toID(by), room, connection, spl[4], by.charAt(0));
				this.chatMessage(spl[4], by, room, connection);
				break;
			case "pm":
				by = spl[2];
				if (toID(by) === toID(config.nick) && ranks.indexOf(by.charAt(0)) > -1)
				{
					this.ranks[room] = by.charAt(0);
				}
				if (by !== " " + config.nick)
				{
					console.log("PM from " + by + " at " + new Date().toLocaleString() + ": " + spl[4]); //Logs PMs to BoTTT III in the console.
				}
				this.chatMessage(spl[4], by, ',' + by, connection);
				break;
			case 'N': //Name changes with /nick or using the button
				by = spl[2];
				if (toID(by) === toID(config.nick) && ranks.indexOf(by.charAt(0)) > -1)
				{
					this.ranks[room] = by.charAt(0);
				}
				break;
			case 'J': case 'j': //User joining the room
				by = spl[2];
				if (toID(by) === toID(config.nick) && ranks.indexOf(by.charAt(0)) > -1)
				{
					this.ranks[room] = by.charAt(0);
				}
				break;
			case 'l': case 'L': //User leaving the room
				break;
			case "tournament":
				if (spl[2] === "update")
				{
					hasTourStarted = true;
				}
				if (spl[2] === "create")
				{
					hasTourStarted = true;
				}
				if (spl[2] === "end" || spl[2] === "forceend")
				{
					hasTourStarted = false;
				}
				break;
			case "html": //HTML was received
				break;
		}
	},
	chatMessage: function(message, by, room, connection)
	{
		let cmdrMessage = "[\"" + room + '|' + by + '|' + message + "\"]";
		message = message.trim();

		//Auto-accepts invites to rooms if the global rank is % or higher.
		if (room.charAt(0) === ',' && message.substr(0,8) === "/invite " && this.hasRank(by, "%@*&~"))
		{
			this.say(connection, "", "/join " + message.substr(8));
		}

		//If it's not a command or BoTTT III is saying a message, don't go any farther
		if (message.substr(0, config.commandcharacter.length) !== config.commandcharacter || toID(by) === toID(config.nick)) return;

		message = message.substr(config.commandcharacter.length);
		let index = message.indexOf(" ");
		let arg = "";
		let cmd;

		//Separate the command from its arguments, if any.
		if (index > -1)
		{
			cmd = message.substr(0, index);
			arg = message.substr(index + 1).trim();
		}
		else
		{
			cmd = message;
		}

		if (Commands[cmd])
		{
			//Accounts for aliases
			while (typeof Commands[cmd] !== "function")
			{
				cmd = Commands[cmd];
			}
			if (typeof Commands[cmd] === "function")
			{
				cmdr(cmdrMessage); //Logs the command information if specified in config.

				if (this.canUse(cmd, room, by, arg))
				{
					Commands[cmd].call(this, arg, by, room, connection); //Run the command from commands.js
				}
				else
				{
					this.say(connection, room, "/pm " + by + ", You don't have access to this command.");
				}
			}
			else
			{
				error("invalid command type for " + cmd + ": " + (typeof Commands[cmd]));
			}
		}
	},
	say: function(connection, room, text)
	{
		let str;
		if (room.charAt(0) !== ',')
		{
			str = (room !== "lobby" ? room : "") + '|' + text;
		}
		else //if room has a comma, it was done in PM
		{
			room = room.substr(1);
			str = "|/pm " + room + ", " + text;
		}
		this.msgQueue.push(str);
		if (!this.msgDequeue)
		{
			this.msgDequeue = setInterval(function ()
			{
				let msg = this.msgQueue.shift();
				if (msg)
				{
					return send(connection, msg);
				}
				clearInterval(this.msgDequeue);
				this.msgDequeue = null;
			}.bind(this), 750);
		}
	},


	//If the user has the specified rank or is on the command exception list, return true
	hasRank: function(user, rank)
	{
		return rank.split("").indexOf(user.charAt(0)) !== -1;
	},

	//Modified by DaWoblefet
	canUse: function(cmd, room, user, arg)
	{
		let canUse = false;
		let userRank;

		if (rankMap.get(user.charAt(0)) === -1)
		{
			userRank = NONE;
		}
		else
		{
			userRank = rankMap.get(user.charAt(0));
		}

		if (userRank >= NONE)
		{
			if(["about", "commands", "usage"].indexOf(cmd) >= 0)
			{
				canUse = true;
			}
		}

		if (userRank >= VOICE)
		{
			if (["tour", "notice", "usage", "icpa"].indexOf(cmd) >= 0)
			{
				canUse = true;
			}
		}

		if (userRank >= DRIVER)
		{
			if (["insult", "8ball", "say", "objectively", "joke", "compliment", "mish", "uno", "chef", "platypus", "mynameis", "nom"].indexOf(cmd) >= 0)
			{
				canUse = true;
			}
		}

		if (toID(user) === "dawoblefet")
		{
			if (cmd === "reload" || cmd === "js" || cmd === "kill")
			{
				canUse = true;
			}
		}

		if (userRank === ROOMOWNER || ["dawoblefet", "blarajan", "kaori", "makiri"].indexOf(toID(room)) >= 0)
		{
			if (cmd === "custom")
			{
				canUse = true;
			}
		}

		//Special cases
		switch (cmd)
		{
			case "tour":
				if ((user === "LegaVGC" && arg === "vgc13") || arg === "samples") {canUse = true;}
			case "blog":
				if (user.substr(0, 7) === "+ansena" || user === "#DaWoblefet") {canUse = true;}
				break;
			case "icpa":
				if (user.substr(0,13) === " torwildheart" || user.substr(0,5) == " ICPA") {canUse = true;}
				break;
			case "chef":
				if (user.substr(0,5) === " chef") {canUse = true;}
				break;
			case "platypus":
				if (user === " PlatypusVGC" || user === " AwesomePlatypus") {canUse = true;}
				break;
			case "mynameis":
				if (user === " CasedVictory") {canUse = true;}
				break;
			case "nom":
				if (user === " Seaco") {canUse = true;}
				break;
			default:
				break;
		}

		return canUse;
	},

	processChatData: function(user, room, connection, msg, auth)
	{
		if (!user || room.charAt(0) === ',') return;

		msg = msg.trim().replace(/[ \u0000\u200B-\u200F]+/g, " "); //Removes extra spaces and null characters so messages that should trigger stretching do so

		let now = Date.now();
		if (!this.chatData[user])
		{
			this.chatData[user] =
			{
				zeroTol: 0,
			};
		}
		let userData = this.chatData[user];

		if (!this.chatData[user][room])
		{
			this.chatData[user][room] =
			{
				times: [],
				points: 0,
				lastAction: 0,
				triggeredAutocorrect: 0
			};
		}
		let roomData = userData[room];

		roomData.times.push(now);

		//This deals with punishing rulebreakers. Note that the bot can't think, however, so it might make mistakes. It will not punish drivers+.
		if (config.allowmute && config.whitelist.indexOf(user) === -1 && "%@*&#~".indexOf(auth) === -1)
		{
			let useDefault = !(this.settings.modding && this.settings.modding[room]);
			let pointVal = 0;
			let muteMessage = "";
			let modSettings = useDefault ? null : this.settings.modding[room];

			//Moderation for flooding (more than x lines in y seconds)
			let times = roomData.times;
			let timesLen = times.length;
			let isFlooding = (timesLen >= FLOOD_MESSAGE_NUM && (now - times[timesLen - FLOOD_MESSAGE_NUM]) < FLOOD_MESSAGE_TIME
				&& (now - times[timesLen - FLOOD_MESSAGE_NUM]) > (FLOOD_PER_MSG_MIN * FLOOD_MESSAGE_NUM));
			if ((useDefault || !modSettings.flooding) && isFlooding)
			{
				if (pointVal < 2)
				{
					pointVal = 2;
					muteMessage = ", Stop spamming the chat";
				}
			}
			//Moderation for caps (over x% of the letters in a line of y characters are capital)
			let capsMatch = msg.replace(/[^A-Za-z]/g, "").match(/[A-Z]/g);
			if ((useDefault || !modSettings.caps) && capsMatch && toID(msg).length > MIN_CAPS_LENGTH && (capsMatch.length >= ~~(toID(msg).length * MIN_CAPS_PROPORTION)))
			{
				if (pointVal < 1)
				{
					pointVal = 1;
					muteMessage = ", Watch the caps";
				}
			}
			//Moderation for stretching (over x consecutive characters in the message are the same)
			let stretchMatch = /(.)\1{7,}/gi.test(msg) || /(..+)\1{4,}/gi.test(msg); //Matches the same character (or group of characters) 8 (or 5) or more times in a row
			if ((useDefault || !modSettings.stretching) && stretchMatch)
			{
				if (pointVal < 1)
				{
					pointVal = 1;
					muteMessage = ", Don't stretch out what you type";
				}
			}

			//Autocorrect regexes and corresponding autocorrections
			let autocorrectRegexes = [/(n|N)inetails/, /(m|M)eowstick/, /(c|C)owmoo/, /tylee/, /(w|W)olfie/, /(A|a)moongus([^s]|$)/];
			let autocorrectMessages = ["Ninetales", "Meowstic", "Kommo-o", "tlyee", "Wolfey", "Amoonguss"];

			for (let i = 0; i < autocorrectRegexes.length; i++)
			{
				if (autocorrectRegexes[i].test(msg)) //If the message contains the regular expression
				{
					this.say(connection, room, "*" + autocorrectMessages[i]);
					roomData.triggeredAutocorrect++;
				}
			}

			/* Room policy changed to not autocrrect on Pdon:
			/(p|P)(d|D)(o|O)(n|N)([^(z|Z)]|$)/ (for Pdon -> Primal Groudon; needed to account for Pd0nZ's name)
			Came with this PM bc of its controversial nature: Please do not use the abbreviation \"pdon\" for Primal Groudon. Say it out loud and you'll realize why. You can just say Groudon or don, and everyone will know what Pokemon you're talking about.
			*/

			if ((pointVal > 0 || roomData.triggeredAutocorrect >= 3)&& now - roomData.lastAction >= ACTION_COOLDOWN)
			{
				let cmd = "mute";
				//Defaults to the next punishment in config.punishVals instead of repeating the same action (so a second warn-worthy offense would result in a mute instead of a warn, and the third an hourmute, etc)
				if (roomData.points >= pointVal && pointVal < 4)
				{
					roomData.points++;
					cmd = config.punishvals[roomData.points] || cmd;
				}
				else //If the action hasn't been done before (is worth more points), it will be the one picked
				{
					cmd = config.punishvals[pointVal] || cmd;
					roomData.points = pointVal; // next action will be one level higher than this one (in most cases)
				}
				//Can't warn in private rooms
				if (config.privaterooms.indexOf(room) > -1 && cmd === "warn")
				{
					cmd = "mute";
				}

				//If the bot has % instead of @ or %, it will default to hourmuting as its highest level of punishment instead of roombanning
				if (roomData.points >= 4 && !this.hasRank(this.ranks[room] || " ", "@*&#~"))
				{
					cmd = "hourmute";
				}

				if (roomData.triggeredAutocorrect >= 3)
				{
					cmd = "warn";
					muteMessage = ", Stop triggering the autocorrect intentionally.";
					roomData.triggeredAutocorrect = 2; //resets the count so it won't continually spam warnings
				}

				//If zero tolerance users break a rule, they get an instant roomban or hourmute
				if (userData.zeroTol > 4)
				{
					muteMessage = ", Automated response: zero tolerance user";
					cmd = this.hasRank(this.ranks[room] || " ", "@*&#~") ? "roomban" : "hourmute";
				}
				if (roomData.points > 1)
				{
					userData.zeroTol++; //Getting muted or higher increases your zero tolerance level (warns do not)
				}
				roomData.lastAction = now;
				this.say(connection, room, '/' + cmd + " " + user + muteMessage);
				console.log(cmd + ": " + user + " at " + new Date().toLocaleString());
			}
		}
	},
	cleanChatData: function()
	{
		let chatData = this.chatData;
		for (user in chatData)
		{
			for (room in chatData[user])
			{
				let roomData = chatData[user][room];
				if (!Object.isObject(roomData)) continue;

				if (!roomData.times || !roomData.times.length)
				{
					delete chatData[user][room];
					continue;
				}
				let newTimes = [];
				let now = Date.now();
				let times = roomData.times;
				for (let i = 0, len = times.length; i < len; i++)
				{
					if (now - times[i] < 5 * 1000)
					{
						newTimes.push(times[i]);
					}
				}
				newTimes.sort(function (a, b)
				{
					return a - b;
				});
				roomData.times = newTimes;
				if (roomData.points > 0 && roomData.points < 4)
				{
					roomData.points--;
				}
			}
		}
	},

	uncacheTree: function(root)
	{
		let uncache = [require.resolve(root)];
		do
		{
			let newuncache = [];
			for (let i = 0; i < uncache.length; ++i)
			{
				if (require.cache[uncache[i]])
				{
					newuncache.push.apply(newuncache,
						require.cache[uncache[i]].children.map(function(module)
						{
							return module.filename;
						})
					);
					delete require.cache[uncache[i]];
				}
			}
			uncache = newuncache;
		} while (uncache.length > 0);
	},
};

/* Related to .seen


	updateSeen: function(user, type, detail) {
		if (type !== 'n' && config.rooms.indexOf(detail) === -1 || config.privaterooms.indexOf(toId(detail)) > -1) return;
		var now = Date.now();
		if (!this.chatData[user]) this.chatData[user] = {
			zeroTol: 0,
			lastSeen: '',
			seenAt: now
		};
		if (!detail) return;
		var userData = this.chatData[user];
		var msg = '';
		switch (type) {
		case 'j':
		case 'J':
			msg += 'joining ';
			break;
		case 'l':
		case 'L':
			msg += 'leaving ';
			break;
		case 'c':
		case 'c:':
			msg += 'chatting in ';
			break;
		case 'N':
			msg += 'changing nick to ';
			if (detail.charAt(0) !== ' ') detail = detail.substr(1);
			break;
		}
		msg += detail.trim() + '.';
		userData.lastSeen = msg;
		userData.seenAt = now;
	},

	getTimeAgo: function(time) {
		time = ~~((Date.now() - time) / 1000);

		var seconds = time % 60;
		var times = [];
		if (seconds) times.push(seconds + (seconds === 1 ? ' second': ' seconds'));
		if (time >= 60) {
			time = ~~((time - seconds) / 60);
			var minutes = time % 60;
			if (minutes) times.unshift(minutes + (minutes === 1 ? ' minute' : ' minutes'));
			if (time >= 60) {
				time = ~~((time - minutes) / 60);
				hours = time % 24;
				if (hours) times.unshift(hours + (hours === 1 ? ' hour' : ' hours'));
				if (time >= 24) {
					days = ~~((time - hours) / 24);
					if (days) times.unshift(days + (days === 1 ? ' day' : ' days'));
				}
			}
		}
		if (!times.length) return '0 seconds';
		return times.join(', ');
	},
*/

/* Blacklisting
	isBlacklisted: function(user, room) {
		var blacklist = this.settings.blacklist;
		return (blacklist && blacklist[room] && blacklist[room][user]);
	},
	blacklistUser: function(user, room) {
		var blacklist = this.settings.blacklist || (this.settings.blacklist = {});
		if (!blacklist[room]) blacklist[room] = {};

		if (blacklist[room][user]) return false;
		blacklist[room][user] = 1;
		return true;
	},
	unblacklistUser: function(user, room) {
		if (!this.isBlacklisted(user, room)) return false;
		delete this.settings.blacklist[room][user];
		return true;
	},
*/

/* Others

		if (!this.settings[cmd] || !this.settings[cmd][room]) {
			canUse = this.hasRank(user, ranks.substr(ranks.indexOf((cmd === 'autoban' || cmd === 'banword') ? '#' : config.defaultrank)));
		} else if (this.settings[cmd][room] === true) {
			canUse = true;
		} else if (ranks.indexOf(this.settings[cmd][room]) > -1) {
			canUse = this.hasRank(user, ranks.substr(ranks.indexOf(this.settings[cmd][room])));
		}

	uploadToHastebin: function(con, room, by, toUpload) {
		var self = this;

		var reqOpts = {
			hostname: "hastebin.com",
			method: "POST",
			path: '/documents'
		};

		var req = require('http').request(reqOpts, function(res) {
			res.on('data', function(chunk) {
				self.say(con, room, (room.charAt(0) === ',' ? "" : "/pm " + by + ", ") + "hastebin.com/raw/" + JSON.parse(chunk.toString())['key']);
			});
		});

		req.write(toUpload);
		req.end();
	},

	getDocMeta: function(id, callback) {
		https.get('https://www.googleapis.com/drive/v2/files/' + id + '?key=' + config.googleapikey, function (res) {
			var data = '';
			res.on('data', function (part) {
				data += part;
			});
			res.on('end', function (end) {
				var json = JSON.parse(data);
				if (json) {
					callback(null, json);
				} else {
					callback('Invalid response', data);
				}
			});
		});
	},
	getDocCsv: function(meta, callback) {
		https.get('https://docs.google.com/spreadsheet/pub?key=' + meta.id + '&output=csv', function (res) {
			var data = '';
			res.on('data', function (part) {
				data += part;
			});
			res.on('end', function (end) {
				callback(data);
			});
		});
	}

	writeSettings: (function() {
		var writing = false;
		var writePending = false; // whether or not a new write is pending
		var finishWriting = function() {
			writing = false;
			if (writePending) {
				writePending = false;
				this.writeSettings();
			}
		};
		return function() {
			if (writing) {
				writePending = true;
				return;
			}
			writing = true;
			var data = JSON.stringify(this.settings);
			fs.writeFile('settings.json.0', data, function() {
				// rename is atomic on POSIX, but will throw an error on Windows
				fs.rename('settings.json.0', 'settings.json', function(err) {
					if (err) {
						// This should only happen on Windows.
						fs.writeFile('settings.json', data, finishWriting);
						return;
					}
					finishWriting();
				});
			});
		};
	})(),
*/