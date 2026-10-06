import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
from translate_markdown import paragraphs, protect, validate

class TranslationTests(unittest.TestCase):
    def test_semantics_math_tables_code(self):
        source = '<!-- page 1 -->\n\n# Title\n\nA $x_i$.\n\n:::caption\nFigure 1.\n\nSecond caption.\n:::\n\n$$\nx=1\n\ny=2\n$$\n\n```python\nx=1\n\ny=2\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |'
        blocks=paragraphs(source)
        self.assertEqual(len(blocks),7)
        self.assertEqual(blocks[2],':::caption\nFigure 1.\n:::')
        self.assertEqual(blocks[3],':::caption\nSecond caption.\n:::')
        self.assertIn('x=1\n\ny=2',blocks[4])
        self.assertTrue(blocks[5].endswith('```'))
        self.assertTrue(blocks[6].startswith('|'))
    def batch(self, source):
        text,tokens=protect(source)
        return [{'id':0,'source':source,'text':text,'tokens':tokens}]
    def test_exact_formula_and_image_restore(self):
        batch=self.batch('We use $x_i$ and $$\\frac{1}{2}$$.\n\n![图](paper.layout.assets/figure.png)')
        translated=batch[0]['text'].replace('We use','我们使用').replace('and','和')
        value=validate(batch,{'blocks':[{'id':0,'text':translated}]})[0]
        self.assertIn('$x_i$',value);self.assertIn('![图](paper.layout.assets/figure.png)',value)
    def test_reject_missing_duplicate_empty_and_changed_tokens(self):
        batch=self.batch('A $x$.')
        for values in [[],[{'id':1,'text':'A'}],[{'id':0,'text':''}],[{'id':0,'text':'A'}],[{'id':0,'text':batch[0]['text']+' RDPROTECT0000TOKEN'}]]:
            with self.assertRaises(ValueError): validate(batch,{'blocks':values})
    def test_preserves_heading_quote_list_and_link_targets(self):
        for source in ['## Attention', '> Evidence', '- Result', '1. Example', '[Paper](https://example.com/paper)']:
            batch=self.batch(source)
            value=validate(batch,{'blocks':[{'id':0,'text':batch[0]['text'].replace('Attention','注意力').replace('Paper','论文')}]})[0]
            self.assertTrue(value.startswith(source.split(' ')[0]) if ' ' in source else '(https://example.com/paper)' in value)
        with self.assertRaises(ValueError): validate(self.batch('$$x=1$$'),{'blocks':[{'id':0,'text':'公式：RDPROTECT0000TOKEN'}]})
    def test_reject_changed_numbers(self):
        with self.assertRaises(ValueError): validate(self.batch('We used 8 heads.'),{'blocks':[{'id':0,'text':'我们使用了16个头。'}]})
    def test_chinese_adjacent_numbers_and_negative_sign(self):
        batch=self.batch('We used 8 heads.')
        value=validate(batch,{'blocks':[{'id':0,'text':batch[0]['text'].replace('We used ','我们使用了').replace(' heads.','个头。')}]})[0]
        self.assertIn('8',value)
        with self.assertRaises(ValueError): validate(self.batch('The value is -1.'),{'blocks':[{'id':0,'text':'数值为1。'}]})
    def test_preserve_negative_and_conditional_prompt(self):
        from translate_markdown import PROMPT
        self.assertIn('否定',PROMPT);self.assertIn('条件',PROMPT);self.assertIn('不强化结论',PROMPT)


class RecoveryTests(unittest.TestCase):
    def test_timeout_keeps_verified_blocks_and_resume_invalidates_on_change(self):
        from translate_markdown import translate, TranslationFailure, validate
        with tempfile.TemporaryDirectory() as folder:
            src=Path(folder)/'source.md';out=Path(folder)/'source.translation.md'
            src.write_text('\n\n'.join(label+' '+('word '*400) for label in ['First','Second','Third']))
            calls=[]
            def fail_after_first(client,model,batch,context,feedback=''):
                calls.append(batch[0]['id'])
                if batch[0]['id']>0: raise TimeoutError()
                return validate(batch,{'blocks':[{'id':b['id'],'text':b['text'].replace('word','文字')} for b in batch]}),{'promptTokens':1,'completionTokens':2}
            env={'GLM_API_KEY':'test','GLM_MODEL':'glm-5.3-flash'}
            with patch('translate_markdown.request_batch',fail_after_first):
                with self.assertRaises(TranslationFailure): translate(src,env,out)
            checkpoint=json.loads(out.with_suffix('.checkpoint.json').read_text())
            self.assertEqual(list(checkpoint['translated']),['0'])
            self.assertEqual(json.loads(out.with_suffix('.progress.json').read_text())['stage'],'failed')
            self.assertFalse(out.exists())
            calls.clear()
            def success(client,model,batch,context,feedback=''):
                calls.extend(b['id'] for b in batch)
                return validate(batch,{'blocks':[{'id':b['id'],'text':b['text'].replace('word','文字')} for b in batch]}),{'promptTokens':1,'completionTokens':2}
            with patch('translate_markdown.request_batch',success): markdown,meta=translate(src,env,out)
            self.assertEqual(calls,[1,2]);self.assertEqual(len(meta['blocks']),3)
            self.assertIn('translation-block 2',markdown)
            calls.clear();src.write_text(src.read_text()+'\n\nChanged source.')
            with patch('translate_markdown.request_batch',success): translate(src,env,out)
            self.assertIn(0,calls)
    def test_stream_low_reasoning_and_usage(self):
        from translate_markdown import request_batch, protect
        text,tokens=protect('Use $x$ and 8 heads.')
        batch=[{'id':0,'source':'Use $x$ and 8 heads.','text':text,'tokens':tokens}]
        response=json.dumps({'blocks':[{'id':0,'text':text.replace('Use','使用')}]})
        chunks=[SimpleNamespace(usage=None,choices=[SimpleNamespace(delta=SimpleNamespace(content=response),finish_reason='stop')]),SimpleNamespace(usage=SimpleNamespace(prompt_tokens=8,completion_tokens=9),choices=[])]
        class Stream:
            def __enter__(self):return iter(chunks)
            def __exit__(self,*args):pass
        params={}
        def create(**kwargs):params.update(kwargs);return Stream()
        client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        values,usage=request_batch(client,'glm-5.3-flash',batch,[])
        self.assertEqual(params['extra_body']['reasoning_effort'],'low')
        self.assertTrue(params['stream']);self.assertEqual(usage['completionTokens'],9)
        self.assertIn('$x$',values[0])
        chunks[0].choices[0].finish_reason='length'
        with self.assertRaises(ValueError):request_batch(client,'glm-5.3-flash',batch,[])


class NumericRegressionTests(unittest.TestCase):
    batch = TranslationTests.batch
    def test_hyphen_is_not_a_negative_number(self):
        b=self.batch('Use the level-13 S2 grid and 3-dimensional data.')
        text=b[0]['text'].replace('Use the level-','使用第').replace(' S','级S').replace(' grid and ','网格及').replace('-dimensional data.','维数据。')
        self.assertIn('第13级S2',validate(b,{'blocks':[{'id':0,'text':text}]})[0])
    def test_full_numeric_expressions_and_added_sign(self):
        for expr in ['-13','−13','+13','1e-3','1.25E−4','1,000','95%','10–20','10-20','10 — 20']:
            b=self.batch('Value '+expr+'.')
            self.assertIn(expr,list(b[0]['tokens'].values()))
            self.assertIn(expr,validate(b,{'blocks':[{'id':0,'text':b[0]['text'].replace('Value ','数值为')} ]})[0])
        b=self.batch('Value 13.')
        with self.assertRaises(ValueError):validate(b,{'blocks':[{'id':0,'text':b[0]['text'].replace('Value ','数值为-')} ]})
    def test_new_number_formula_and_cross_block_token_rejected(self):
        b=self.batch('Value 13.')
        for suffix in [' 14',' $C$',' RDPROTECT0999TOKEN']:
            with self.assertRaises(ValueError):validate(b,{'blocks':[{'id':0,'text':b[0]['text']+suffix}]})
    def test_reordered_numbers_allowed(self):
        b=self.batch('Compare 8 with 16.')
        self.assertEqual(validate(b,{'blocks':[{'id':0,'text':'将RDPROTECT0001TOKEN与RDPROTECT0000TOKEN比较。'}]})[0],'将16与8比较。')
    def test_failed_batch_splits_without_repeating_successful_blocks(self):
        from translate_markdown import translate,ValidationFailure
        with tempfile.TemporaryDirectory() as folder:
            src=Path(folder)/'source.md';out=Path(folder)/'source.translation.md';src.write_text('First paragraph.\n\nSecond paragraph.')
            calls=[]
            def respond(client,model,batch,context,feedback=''):
                calls.append([b['id'] for b in batch])
                if len(batch)>1:raise ValidationFailure('TRANSLATION_TOKEN_MISMATCH',1,'missing_token')
                return {b['id']:b['source'] for b in batch},{'promptTokens':1,'completionTokens':1}
            with patch('translate_markdown.request_batch',respond):_,meta=translate(src,{'GLM_API_KEY':'test'},out)
            self.assertEqual(calls,[[0,1],[0,1],[0],[1]]);self.assertEqual(len(meta['blocks']),2)
    def test_legacy_checkpoint_revalidated(self):
        import hashlib
        from translate_markdown import translate,PROMPT,PROTECTED,NUMERIC
        with tempfile.TemporaryDirectory() as folder:
            src=Path(folder)/'source.md';out=Path(folder)/'source.translation.md';src.write_text('A level-13 grid.\n\nA 2 grid.')
            from translate_markdown import IDENTIFIER
            legacy=PROTECTED.pattern.replace(IDENTIFIER+'|','').replace(NUMERIC,r'(?<![A-Za-z])-?\d+(?:\.\d+)?|\d+(?:\.\d+)?')
            signature=hashlib.sha256((src.read_text()+'glm-5.3-flash'+PROMPT+legacy+'stream-v2').encode()).hexdigest()
            out.with_suffix('.checkpoint.json').write_text(json.dumps({'signature':signature,'translated':{'0':'第13级网格。','1':'第3级网格。'}}))
            calls=[]
            def respond(client,model,batch,context,feedback=''):
                calls.extend(b['id'] for b in batch);return {b['id']:b['source'] for b in batch},{'promptTokens':0,'completionTokens':0}
            with patch('translate_markdown.request_batch',respond):_,meta=translate(src,{'GLM_API_KEY':'test'},out)
            self.assertEqual(calls,[1]);self.assertEqual(meta['blocks'][0]['translation'],'第13级网格。')

class DiagnosticTests(unittest.TestCase):
    def test_only_allowlisted_metadata_logged(self):
        import io
        from contextlib import redirect_stderr
        from diagnostics import event
        output=io.StringIO()
        with redirect_stderr(output):event('TRANSLATION_FAILED','validate',blockId=60,apiKey='secret',body='paper text',rule='extra_number')
        value=json.loads(output.getvalue().removeprefix('RDLOG '))
        self.assertEqual(value['attributes'],{'blockId':60,'rule':'extra_number'})
        self.assertNotIn('secret',output.getvalue());self.assertNotIn('paper text',output.getvalue())


class BoundaryTests(unittest.TestCase):
    batch=TranslationTests.batch
    def test_do_not_merge_numbers_or_turn_them_into_range(self):
        b=self.batch('Compare 8 with 16.')
        for text in ['RDPROTECT0000TOKENRDPROTECT0001TOKEN','RDPROTECT0000TOKEN.RDPROTECT0001TOKEN','RDPROTECT0000TOKEN-RDPROTECT0001TOKEN']:
            with self.assertRaises(ValueError):validate(b,{'blocks':[{'id':0,'text':text}]})
    def test_tokens_are_namespaced_per_paragraph(self):
        from translate_markdown import protect
        a,at=protect('Value 8.',1);b,bt=protect('Value 16.',2)
        with self.assertRaises(ValueError):validate([{'id':1,'source':'Value 8.','text':a,'tokens':at}],{'blocks':[{'id':1,'text':b}]})
    def test_single_paragraph_sentence_fallback_keeps_alignment(self):
        from translate_markdown import translate,ValidationFailure
        with tempfile.TemporaryDirectory() as folder:
            src=Path(folder)/'source.md';out=Path(folder)/'source.translation.md';src.write_text('First 8 results. Second 16 results.')
            calls=[]
            def respond(client,model,batch,context,feedback=''):
                b=batch[0];calls.append(b['text'])
                if len(b['tokens'])>1:raise ValidationFailure('TRANSLATION_TOKEN_MISMATCH',0,'missing_token')
                return validate(batch,{'blocks':[{'id':b['id'],'text':b['text'].replace('First ','前').replace('Second ','后').replace(' results.','项结果。')}]}),{'promptTokens':1,'completionTokens':1}
            with patch('translate_markdown.request_batch',respond):md,meta=translate(src,{'GLM_API_KEY':'test'},out)
            self.assertEqual(len(meta['blocks']),1);self.assertEqual(len(calls),4);self.assertIn('前8项结果。 后16项结果。',md)


class LexicalNumberTests(unittest.TestCase):
    batch=TranslationTests.batch
    def test_june_date_can_be_rendered_as_chinese_numeric_month(self):
        b=self.batch('19–24 June 2011.')
        text=b[0]['text'].replace(' June ',' 6月 ')
        self.assertIn('6月',validate(b,{'blocks':[{'id':0,'text':text}]})[0])
        with self.assertRaises(ValueError):validate(b,{'blocks':[{'id':0,'text':text+' 6月'}]})
        with self.assertRaises(ValueError):validate(b,{'blocks':[{'id':0,'text':text.replace('6月','7月')}]})
    def test_word_numbers_are_bounded_and_negative_not_invented(self):
        b=self.batch('The top-five results.')
        self.assertEqual(validate(b,{'blocks':[{'id':0,'text':'前5项结果。'}]})[0],'前5项结果。')
        for text in ['前6项结果。','前5项及另外5项结果。','前-5项结果。']:
            with self.assertRaises(ValueError):validate(b,{'blocks':[{'id':0,'text':text}]})
        with self.assertRaises(ValueError):validate(self.batch('This may help.'),{'blocks':[{'id':0,'text':'这在5月有帮助。'}]})

class IdentifierTests(unittest.TestCase):
    batch=TranslationTests.batch
    def test_isbn_is_one_protected_identifier(self):
        b=self.batch('ISBN 978-3-030-26071-2.')
        self.assertEqual(list(b[0]['tokens'].values()),['978-3-030-26071-2'])
        self.assertIn('978-3-030-26071-2',validate(b,{'blocks':[{'id':0,'text':b[0]['text']}]})[0])
        with self.assertRaises(ValueError):validate(b,{'blocks':[{'id':0,'text':'ISBN 978-3-030-26071-3.'}]})

class CheckpointWhitespaceTests(unittest.TestCase):
    def test_list_spacing_does_not_invalidate_checkpoint(self):
        from translate_markdown import protected_equivalent
        self.assertTrue(protected_equivalent('12. July 2012.','12.  2012年7月。'))
        self.assertFalse(protected_equivalent('12. July 2012.','13.  2012年7月。'))

if __name__=='__main__': unittest.main()
