defineDescribe('Sequence Generator', ['./Generator'], (Generator) => {
	'use strict';

	const generator = new Generator();

	const AGENT_DEFINE = 'agent define';
	const AGENT_BEGIN = 'agent begin';
	const AGENT_END = 'agent end';

	const BLOCK_BEGIN = 'block begin';
	const BLOCK_SPLIT = 'block split';
	const BLOCK_END = 'block end';

	describe('.generate', () => {
		it('propagates title metadata', () => {
			const input = {
				meta: {title: 'bar'},
				stages: [],
			};
			const sequence = generator.generate(input);
			expect(sequence.meta).toEqual({title: 'bar'});
		});

		it('returns an empty sequence for blank input', () => {
			const sequence = generator.generate({stages: []});
			expect(sequence.stages).toEqual([]);
		});

		it('includes implicit hidden left/right agents', () => {
			const sequence = generator.generate({stages: []});
			expect(sequence.agents).toEqual(['[', ']']);
		});

		it('passes marks and async through', () => {
			const sequence = generator.generate({stages: [
				{type: 'mark', name: 'foo'},
				{type: 'async', target: 'foo'},
				{type: 'async', target: ''},
			]});
			expect(sequence.stages).toEqual([
				{type: 'mark', name: 'foo'},
				{type: 'async', target: 'foo'},
				{type: 'async', target: ''},
			]);
		});

		it('rejects attempts to jump to markers not yet defined', () => {
			expect(() => generator.generate({stages: [
				{type: 'async', target: 'foo'},
				{type: 'mark', name: 'foo'},
			]})).toThrow();
		});

		it('returns aggregated agents', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: '<-', agents: [{name: 'C'}, {name: 'D'}]},
				{type: AGENT_BEGIN, agents: [{name: 'E'}], mode: 'box'},
			]});
			expect(sequence.agents).toEqual(
				['[', 'A', 'B', 'C', 'D', 'E', ']']
			);
		});

		it('always puts the implicit right agent on the right', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: ']'}, {name: 'B'}]},
			]});
			expect(sequence.agents).toEqual(['[', 'B', ']']);
		});

		it('accounts for define calls when ordering agents', () => {
			const sequence = generator.generate({stages: [
				{type: AGENT_DEFINE, agents: [{name: 'B'}]},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
			]});
			expect(sequence.agents).toEqual(['[', 'B', 'A', ']']);
		});

		it('creates implicit begin stages for agents when used', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: '->', agents: [{name: 'B'}, {name: 'C'}]},
			]});
			expect(sequence.stages).toEqual([
				{type: AGENT_BEGIN, agents: ['A', 'B'], mode: 'box'},
				jasmine.anything(),
				{type: AGENT_BEGIN, agents: ['C'], mode: 'box'},
				jasmine.anything(),
				jasmine.anything(),
			]);
		});

		it('passes connections through', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
			]});
			expect(sequence.stages).toEqual([
				jasmine.anything(),
				{type: '->', agents: ['A', 'B']},
				jasmine.anything(),
			]);
		});

		it('creates implicit end stages for all remaining agents', () => {
			const sequence = generator.generate({
				meta: {
					terminators: 'foo',
				},
				stages: [
					{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				],
			});
			expect(sequence.stages).toEqual([
				jasmine.anything(),
				jasmine.anything(),
				{type: AGENT_END, agents: ['A', 'B'], mode: 'foo'},
			]);
		});

		it('does not create duplicate begin stages', () => {
			const sequence = generator.generate({stages: [
				{type: AGENT_BEGIN, agents: [
					{name: 'A'},
					{name: 'B'},
					{name: 'C'},
				], mode: 'box'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: '->', agents: [{name: 'B'}, {name: 'C'}]},
			]});
			expect(sequence.stages).toEqual([
				{type: AGENT_BEGIN, agents: ['A', 'B', 'C'], mode: 'box'},
				{type: '->', agents: jasmine.anything()},
				{type: '->', agents: jasmine.anything()},
				{type: AGENT_END, agents: ['A', 'B', 'C'], mode: 'none'},
			]);
		});

		it('redisplays agents if they have been hidden', () => {
			const sequence = generator.generate({stages: [
				{type: AGENT_BEGIN, agents: [
					{name: 'A'},
					{name: 'B'},
				], mode: 'box'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: AGENT_END, agents: [{name: 'B'}], mode: 'cross'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
			]});
			expect(sequence.stages).toEqual([
				{type: AGENT_BEGIN, agents: ['A', 'B'], mode: 'box'},
				jasmine.anything(),
				{type: AGENT_END, agents: ['B'], mode: 'cross'},
				{type: AGENT_BEGIN, agents: ['B'], mode: 'box'},
				jasmine.anything(),
				{type: AGENT_END, agents: ['A', 'B'], mode: 'none'},
			]);
		});

		it('collapses adjacent begin statements', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: AGENT_BEGIN, agents: [{name: 'D'}], mode: 'box'},
				{type: '->', agents: [{name: 'B'}, {name: 'C'}]},
				{type: '->', agents: [{name: 'C'}, {name: 'D'}]},
			]});
			expect(sequence.stages).toEqual([
				{type: AGENT_BEGIN, agents: ['A', 'B'], mode: 'box'},
				{type: '->', agents: jasmine.anything()},
				{type: AGENT_BEGIN, agents: ['D', 'C'], mode: 'box'},
				{type: '->', agents: jasmine.anything()},
				{type: '->', agents: jasmine.anything()},
				jasmine.anything(),
			]);
		});

		it('removes superfluous begin statements', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: AGENT_BEGIN, agents: [
					{name: 'A'},
					{name: 'C'},
					{name: 'D'},
				], mode: 'box'},
				{type: AGENT_BEGIN, agents: [
					{name: 'C'},
					{name: 'E'},
				], mode: 'box'},
			]});
			expect(sequence.stages).toEqual([
				{type: AGENT_BEGIN, agents: ['A', 'B'], mode: 'box'},
				{type: '->', agents: jasmine.anything()},
				{type: AGENT_BEGIN, agents: ['C', 'D', 'E'], mode: 'box'},
				jasmine.anything(),
			]);
		});

		it('removes superfluous end statements', () => {
			const sequence = generator.generate({stages: [
				{type: AGENT_DEFINE, agents: [{name: 'E'}]},
				{type: AGENT_BEGIN, agents: [
					{name: 'C'},
					{name: 'D'},
				], mode: 'box'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: AGENT_END, agents: [
					{name: 'A'},
					{name: 'B'},
					{name: 'C'},
				], mode: 'cross'},
				{type: AGENT_END, agents: [
					{name: 'A'},
					{name: 'D'},
					{name: 'E'},
				], mode: 'cross'},
			]});
			expect(sequence.stages).toEqual([
				jasmine.anything(),
				{type: '->', agents: jasmine.anything()},
				{type: AGENT_END, agents: ['A', 'B', 'C', 'D'], mode: 'cross'},
			]);
		});

		it('does not merge different modes of end', () => {
			const sequence = generator.generate({stages: [
				{type: AGENT_BEGIN, agents: [
					{name: 'C'},
					{name: 'D'},
				], mode: 'box'},
				{type: '->', agents: [
					{name: 'A'},
					{name: 'B'},
				]},
				{type: AGENT_END, agents: [
					{name: 'A'},
					{name: 'B'},
					{name: 'C'},
				], mode: 'cross'},
			]});
			expect(sequence.stages).toEqual([
				jasmine.anything(),
				{type: '->', agents: jasmine.anything()},
				{type: AGENT_END, agents: ['A', 'B', 'C'], mode: 'cross'},
				{type: AGENT_END, agents: ['D'], mode: 'none'},
			]);
		});

		it('creates virtual agents for block statements', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
			]});

			expect(sequence.agents).toEqual(
				['[', '__BLOCK0[', 'A', 'B', '__BLOCK0]', ']']
			);
		});

		it('positions virtual block agents near involved agents', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'C'}, {name: 'D'}]},
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'E'}, {name: 'F'}]},
				{type: BLOCK_END},
				{type: BLOCK_END},
				{type: '->', agents: [{name: 'G'}, {name: 'H'}]},
			]});

			expect(sequence.agents).toEqual([
				'[',
				'A',
				'B',
				'__BLOCK0[',
				'C',
				'D',
				'__BLOCK1[',
				'E',
				'F',
				'__BLOCK1]',
				'__BLOCK0]',
				'G',
				'H',
				']',
			]);
		});

		it('records virtual block agent names in blocks', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
			]});

			const block0 = sequence.stages[0];
			expect(block0.type).toEqual('block');
			expect(block0.left).toEqual('__BLOCK0[');
			expect(block0.right).toEqual('__BLOCK0]');
		});

		it('records all sections within blocks', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: '->', agents: [{name: 'A'}, {name: 'C'}]},
				{type: BLOCK_END},
			]});

			const block0 = sequence.stages[0];
			expect(block0.sections).toEqual([
				{mode: 'if', label: 'abc', stages: [
					{type: AGENT_BEGIN, agents: ['A', 'B'], mode: 'box'},
					{type: '->', agents: ['A', 'B']},
				]},
				{mode: 'else', label: 'xyz', stages: [
					{type: AGENT_BEGIN, agents: ['C'], mode: 'box'},
					{type: '->', agents: ['A', 'C']},
				]},
			]);
		});

		it('records virtual block agents in nested blocks', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: BLOCK_BEGIN, mode: 'if', label: 'def'},
				{type: '->', agents: [{name: 'A'}, {name: 'C'}]},
				{type: BLOCK_END},
				{type: BLOCK_END},
			]});

			expect(sequence.agents).toEqual([
				'[',
				'__BLOCK0[',
				'__BLOCK1[',
				'A',
				'B',
				'C',
				'__BLOCK1]',
				'__BLOCK0]',
				']',
			]);
			const block0 = sequence.stages[0];
			expect(block0.type).toEqual('block');
			expect(block0.left).toEqual('__BLOCK0[');
			expect(block0.right).toEqual('__BLOCK0]');

			const block1 = block0.sections[1].stages[0];
			expect(block1.type).toEqual('block');
			expect(block1.left).toEqual('__BLOCK1[');
			expect(block1.right).toEqual('__BLOCK1]');
		});

		it('preserves block boundaries when agents exist outside', () => {
			const sequence = generator.generate({stages: [
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_BEGIN, mode: 'if', label: 'def'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
				{type: BLOCK_END},
			]});

			expect(sequence.agents).toEqual([
				'[',
				'__BLOCK0[',
				'__BLOCK1[',
				'A',
				'B',
				'__BLOCK1]',
				'__BLOCK0]',
				']',
			]);
			const block0 = sequence.stages[2];
			expect(block0.type).toEqual('block');
			expect(block0.left).toEqual('__BLOCK0[');
			expect(block0.right).toEqual('__BLOCK0]');

			const block1 = block0.sections[0].stages[0];
			expect(block1.type).toEqual('block');
			expect(block1.left).toEqual('__BLOCK1[');
			expect(block1.right).toEqual('__BLOCK1]');
		});

		it('allows empty block parts after split', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: BLOCK_END},
			]});

			const block0 = sequence.stages[0];
			expect(block0.sections).toEqual([
				{mode: 'if', label: 'abc', stages: [
					jasmine.anything(),
					jasmine.anything(),
				]},
				{mode: 'else', label: 'xyz', stages: []},
			]);
		});

		it('allows empty block parts before split', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
			]});

			const block0 = sequence.stages[0];
			expect(block0.sections).toEqual([
				{mode: 'if', label: 'abc', stages: []},
				{mode: 'else', label: 'xyz', stages: [
					jasmine.anything(),
					jasmine.anything(),
				]},
			]);
		});

		it('removes entirely empty blocks', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_END},
				{type: BLOCK_END},
			]});

			expect(sequence.stages).toEqual([]);
		});

		it('removes blocks containing only define statements / markers', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: AGENT_DEFINE, agents: [{name: 'A'}]},
				{type: 'mark', name: 'foo'},
				{type: BLOCK_END},
			]});

			expect(sequence.stages).toEqual([]);
		});

		it('does not create virtual agents for empty blocks', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_END},
				{type: BLOCK_END},
			]});

			expect(sequence.agents).toEqual(['[', ']']);
		});

		it('removes entirely empty nested blocks', () => {
			const sequence = generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_END},
				{type: BLOCK_END},
			]});

			const block0 = sequence.stages[0];
			expect(block0.sections).toEqual([
				{mode: 'if', label: 'abc', stages: [
					jasmine.anything(),
					jasmine.anything(),
				]},
				{mode: 'else', label: 'xyz', stages: []},
			]);
		});

		it('rejects unterminated blocks', () => {
			expect(() => generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
			]})).toThrow();

			expect(() => generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: BLOCK_BEGIN, mode: 'if', label: 'def'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
			]})).toThrow();
		});

		it('rejects extra block terminations', () => {
			expect(() => generator.generate({stages: [
				{type: BLOCK_END},
			]})).toThrow();

			expect(() => generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
				{type: BLOCK_END},
			]})).toThrow();
		});

		it('rejects block splitting without a block', () => {
			expect(() => generator.generate({stages: [
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
			]})).toThrow();

			expect(() => generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'if', label: 'abc'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
			]})).toThrow();
		});

		it('rejects block splitting in non-splittable blocks', () => {
			expect(() => generator.generate({stages: [
				{type: BLOCK_BEGIN, mode: 'repeat', label: 'abc'},
				{type: BLOCK_SPLIT, mode: 'else', label: 'xyz'},
				{type: '->', agents: [{name: 'A'}, {name: 'B'}]},
				{type: BLOCK_END},
			]})).toThrow();
		});

		it('defaults to showing notes around the entire diagram', () => {
			const sequence = generator.generate({stages: [
				{type: 'note right', agents: [], foo: 'bar'},
				{type: 'note left', agents: [], foo: 'bar'},
				{type: 'note over', agents: [], foo: 'bar'},
				{type: 'note right', agents: [{name: '['}], foo: 'bar'},
			]});
			expect(sequence.stages).toEqual([
				{type: 'note right', agents: [']'], foo: 'bar'},
				{type: 'note left', agents: ['['], foo: 'bar'},
				{type: 'note over', agents: ['[', ']'], foo: 'bar'},
				{type: 'note right', agents: ['['], foo: 'bar'},
			]);
		});

		it('rejects attempts to change implicit agents', () => {
			expect(() => generator.generate({stages: [
				{type: AGENT_BEGIN, agents: [{name: '['}], mode: 'box'},
			]})).toThrow();

			expect(() => generator.generate({stages: [
				{type: AGENT_BEGIN, agents: [{name: ']'}], mode: 'box'},
			]})).toThrow();

			expect(() => generator.generate({stages: [
				{type: AGENT_END, agents: [{name: '['}], mode: 'cross'},
			]})).toThrow();

			expect(() => generator.generate({stages: [
				{type: AGENT_END, agents: [{name: ']'}], mode: 'cross'},
			]})).toThrow();
		});
	});
});
