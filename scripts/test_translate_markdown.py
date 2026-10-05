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

if __name__=='__main__': unittest.main()
