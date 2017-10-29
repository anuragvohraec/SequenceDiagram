define([
	'core/ArrayUtilities',
	'./CodeMirrorMode',
	'./CodeMirrorHints',
], (
	array,
	CMMode,
	CMHints
) => {
	'use strict';

	function execAt(str, reg, i) {
		reg.lastIndex = i;
		return reg.exec(str);
	}

	function unescape(match) {
		const c = match[1];
		if(c === 'n') {
			return '\n';
		}
		return match[1];
	}

	const TOKENS = [
		{start: /#/y, end: /(?=\n)|$/y, omit: true},
		{
			start: /"/y,
			end: /"/y,
			escape: /\\(.)/y,
			escapeWith: unescape,
			baseToken: {q: true},
		},
		{
			start: /'/y,
			end: /'/y,
			escape: /\\(.)/y,
			escapeWith:
			unescape,
			baseToken: {q: true},
		},
		{start: /(?=[^ \t\r\n:+\-<>,])/y, end: /(?=[ \t\r\n:+\-<>,])|$/y},
		{start: /(?=[+\-<>])/y, end: /(?=[^+\-<>])|$/y},
		{start: /,/y, baseToken: {v: ','}},
		{start: /:/y, baseToken: {v: ':'}},
		{start: /\n/y, baseToken: {v: '\n'}},
	];

	const BLOCK_TYPES = {
		'if': {type: 'block begin', mode: 'if', skip: []},
		'else': {type: 'block split', mode: 'else', skip: ['if']},
		'elif': {type: 'block split', mode: 'else', skip: []},
		'repeat': {type: 'block begin', mode: 'repeat', skip: []},
	};

	const CONNECTION_TYPES = {
		'->': {line: 'solid', left: false, right: true},
		'<-': {line: 'solid', left: true, right: false},
		'<->': {line: 'solid', left: true, right: true},
		'-->': {line: 'dash', left: false, right: true},
		'<--': {line: 'dash', left: true, right: false},
		'<-->': {line: 'dash', left: true, right: true},
	};

	const TERMINATOR_TYPES = [
		'none',
		'box',
		'cross',
		'bar',
	];

	const NOTE_TYPES = {
		'text': {
			mode: 'text',
			types: {
				'left': {type: 'note left', skip: ['of'], min: 0, max: null},
				'right': {type: 'note right', skip: ['of'], min: 0, max: null},
			},
		},
		'note': {
			mode: 'note',
			types: {
				'over': {type: 'note over', skip: [], min: 0, max: null},
				'left': {type: 'note left', skip: ['of'], min: 0, max: null},
				'right': {type: 'note right', skip: ['of'], min: 0, max: null},
				'between': {type: 'note between', skip: [], min: 2, max: null},
			},
		},
		'state': {
			mode: 'state',
			types: {
				'over': {type: 'note over', skip: [], min: 1, max: 1},
			},
		},
	};

	const AGENT_MANIPULATION_TYPES = {
		'define': {type: 'agent define'},
		'begin': {type: 'agent begin', mode: 'box'},
		'end': {type: 'agent end', mode: 'cross'},
	};

	function tokFindBegin(src, i) {
		for(let j = 0; j < TOKENS.length; ++ j) {
			const block = TOKENS[j];
			const match = execAt(src, block.start, i);
			if(match) {
				return {
					newBlock: block,
					end: !block.end,
					appendSpace: '',
					appendValue: '',
					skip: match[0].length,
				};
			}
		}
		return {
			newBlock: null,
			end: false,
			appendSpace: src[i],
			appendValue: '',
			skip: 1,
		};
	}

	function tokContinuePart(src, i, block) {
		if(block.escape) {
			const match = execAt(src, block.escape, i);
			if(match) {
				return {
					newBlock: null,
					end: false,
					appendSpace: '',
					appendValue: block.escapeWith(match),
					skip: match[0].length,
				};
			}
		}
		const match = execAt(src, block.end, i);
		if(match) {
			return {
				newBlock: null,
				end: true,
				appendSpace: '',
				appendValue: '',
				skip: match[0].length,
			};
		}
		return {
			newBlock: null,
			end: false,
			appendSpace: '',
			appendValue: src[i],
			skip: 1,
		};
	}

	function tokAdvance(src, i, block) {
		if(block) {
			return tokContinuePart(src, i, block);
		} else {
			return tokFindBegin(src, i);
		}
	}

	function joinLabel(line, begin, end) {
		if(end <= begin) {
			return '';
		}
		let result = line[begin].v;
		for(let i = begin + 1; i < end; ++ i) {
			result += line[i].s + line[i].v;
		}
		return result;
	}

	function debugLine(line) {
		return joinLabel(line, 0, line.length);
	}

	function skipOver(line, start, skip, error = null) {
		if(skip.some((token, i) => (
			!line[start + i] ||
			line[start + i].v !== token
		))) {
			if(error) {
				throw new Error(error + ': ' + debugLine(line));
			} else {
				return start;
			}
		}
		return start + skip.length;
	}

	function findToken(line, token, start = 0) {
		for(let i = start; i < line.length; ++ i) {
			if(line[i].v === token) {
				return i;
			}
		}
		return -1;
	}

	function parseAgentList(line, start, end) {
		const list = [];
		let current = '';
		let first = true;
		for(let i = start; i < end; ++ i) {
			if(line[i].v === ',') {
				if(current) {
					list.push({name: current});
					current = '';
					first = true;
				}
			} else {
				if(!first) {
					current += line[i].s;
				} else {
					first = false;
				}
				current += line[i].v;
			}
		}
		if(current) {
			list.push({name: current});
		}
		return list;
	}

	function readAgent(line, begin, end) {
		if(line[begin].v === '+' || line[begin].v === '-') {
			return {
				opt: line[begin].v,
				name: joinLabel(line, begin + 1, end),
			};
		} else {
			return {
				opt: '',
				name: joinLabel(line, begin, end),
			};
		}
	}

	const PARSERS = [
		(line, meta) => { // title
			if(line[0].v !== 'title') {
				return null;
			}

			meta.title = joinLabel(line, 1, line.length);
			return true;
		},

		(line, meta) => { // terminators
			if(line[0].v !== 'terminators') {
				return null;
			}

			if(TERMINATOR_TYPES.indexOf(line[1].v) === -1) {
				throw new Error('Unknown termination: ' + debugLine(line));
			}
			meta.terminators = line[1].v;
			return true;
		},

		(line) => { // block
			if(line[0].v === 'end' && line.length === 1) {
				return {type: 'block end'};
			}

			const type = BLOCK_TYPES[line[0].v];
			if(!type) {
				return null;
			}
			let skip = 1;
			if(line.length > skip) {
				skip = skipOver(line, skip, type.skip, 'Invalid block command');
			}
			skip = skipOver(line, skip, [':']);
			return {
				type: type.type,
				mode: type.mode,
				label: joinLabel(line, skip, line.length),
			};
		},

		(line) => { // agent
			const type = AGENT_MANIPULATION_TYPES[line[0].v];
			if(!type || line.length <= 1) {
				return null;
			}
			return Object.assign({
				agents: parseAgentList(line, 1, line.length),
			}, type);
		},

		(line) => { // async
			if(line[0].v !== 'simultaneously') {
				return null;
			}
			if(array.last(line).v !== ':') {
				return null;
			}
			let target = '';
			if(line.length > 2) {
				if(line[1].v !== 'with') {
					return null;
				}
				target = joinLabel(line, 2, line.length - 1);
			}
			return {
				type: 'async',
				target,
			};
		},

		(line) => { // note
			const mode = NOTE_TYPES[line[0].v];
			const labelSplit = findToken(line, ':');
			if(!mode || labelSplit === -1) {
				return null;
			}
			const type = mode.types[line[1].v];
			if(!type) {
				return null;
			}
			let skip = 2;
			skip = skipOver(line, skip, type.skip);
			const agents = parseAgentList(line, skip, labelSplit);
			if(
				agents.length < type.min ||
				(type.max !== null && agents.length > type.max)
			) {
				throw new Error(
					'Invalid ' + mode.mode +
					': ' + debugLine(line)
				);
			}
			return {
				type: type.type,
				agents,
				mode: mode.mode,
				label: joinLabel(line, labelSplit + 1, line.length),
			};
		},

		(line) => { // connection
			let labelSplit = findToken(line, ':');
			if(labelSplit === -1) {
				labelSplit = line.length;
			}
			let typeSplit = -1;
			let options = null;
			for(let j = 0; j < line.length; ++ j) {
				const opts = CONNECTION_TYPES[line[j].v];
				if(opts) {
					typeSplit = j;
					options = opts;
					break;
				}
			}
			if(typeSplit <= 0 || typeSplit >= labelSplit - 1) {
				return null;
			}
			return Object.assign({
				type: 'connection',
				agents: [
					readAgent(line, 0, typeSplit),
					readAgent(line, typeSplit + 1, labelSplit),
				],
				label: joinLabel(line, labelSplit + 1, line.length),
			}, options);
		},

		(line) => { // marker
			if(line.length < 2 || array.last(line).v !== ':') {
				return null;
			}
			return {
				type: 'mark',
				name: joinLabel(line, 0, line.length - 1),
			};
		},
	];

	function parseLine(line, {meta, stages}) {
		let stage = null;
		for(let i = 0; i < PARSERS.length; ++ i) {
			stage = PARSERS[i](line, meta);
			if(stage) {
				break;
			}
		}
		if(!stage) {
			throw new Error('Unrecognised command: ' + debugLine(line));
		}
		if(typeof stage === 'object') {
			stages.push(stage);
		}
	}

	return class Parser {
		tokenise(src) {
			const tokens = [];
			let block = null;
			let current = {s: '', v: '', q: false};
			for(let i = 0; i <= src.length;) {
				const advance = tokAdvance(src, i, block);
				if(advance.newBlock) {
					block = advance.newBlock;
					Object.assign(current, block.baseToken);
				}
				current.s += advance.appendSpace;
				current.v += advance.appendValue;
				i += advance.skip;
				if(advance.end) {
					if(!block.omit) {
						tokens.push(current);
					}
					current = {s: '', v: '', q: false};
					block = null;
				}
			}
			if(block) {
				throw new Error('Unterminated block');
			}
			return tokens;
		}

		getCodeMirrorMode() {
			return new CMMode(TOKENS);
		}

		getCodeMirrorHints() {
			return CMHints.getHints;
		}

		splitLines(tokens) {
			const lines = [];
			let line = [];
			tokens.forEach((token) => {
				if(token.v === '\n' && !token.q) {
					if(line.length > 0) {
						lines.push(line);
						line = [];
					}
				} else {
					line.push(token);
				}
			});
			if(line.length > 0) {
				lines.push(line);
			}
			return lines;
		}

		parseLines(lines) {
			const result = {
				meta: {
					title: '',
					terminators: 'none',
				},
				stages: [],
			};

			lines.forEach((line) => parseLine(line, result));

			return result;
		}

		parse(src) {
			const tokens = this.tokenise(src);
			const lines = this.splitLines(tokens);
			return this.parseLines(lines);
		}
	};
});

