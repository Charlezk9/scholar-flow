import unittest
import json
import io
from contextlib import redirect_stderr
from layout_markdown import parse_blocks, validate, render_blocks, parse_response, LayoutFailure
from extract_markdown import failure_message

class LayoutTests(unittest.TestCase):
    def test_source_pages_and_equations(self):
        blocks = parse_blocks('<!-- page 4 -->\n\nBody $d_k$.\n\n<!-- page 5 -->\n\n$$\\frac{1}{\\sqrt{d_k}}$$')
        self.assertEqual([b['page'] for b in blocks], [4, 5])
        labels = validate(blocks, {'blocks':[{'id':b['id'],'type':'body'} for b in blocks]})
        out = render_blocks(blocks, labels, {})
        for b in blocks: self.assertIn(b['text'], out)
    def test_rejects_missing_duplicate_or_unknown(self):
        blocks = parse_blocks('A\n\nB')
        for labels in [[],[{'id':0,'type':'body'}]*2,[{'id':0,'type':'body'},{'id':1,'type':'summary'}]]:
            with self.assertRaises(ValueError): validate(blocks, {'blocks':labels})
    def test_cross_page_join_skips_footnote(self):
        blocks = parse_blocks('<!-- page 4 -->\n\n-dimensional\n\nFootnote\n\n<!-- page 5 -->\n\noutput values.')
        labels = {0:{'type':'body'},1:{'type':'note'},2:{'type':'body','join_previous':True}}
        out = render_blocks(blocks,labels,{})
        self.assertIn('-dimensional output values.',out)
        self.assertIn(':::note\nFootnote\n:::',out)
        self.assertIn('<!-- page 5 -->',out)
    def test_real_asset_with_caption_and_normal_quote(self):
        blocks = parse_blocks('Figure 1: Original caption\n\n> Original quotation')
        out = render_blocks(blocks,{0:{'type':'caption'},1:{'type':'body'}},{0:'paper.layout.assets/figure.png'})
        self.assertIn(':::caption\nFigure 1: Original caption\n:::',out)
        self.assertIn('![论文配图](paper.layout.assets/figure.png)',out)
        self.assertIn('> Original quotation',out)
    def test_missing_figure_keeps_visible_feedback(self):
        blocks=parse_blocks('![figure](page-1-figure-1)')
        out=render_blocks(blocks,{0:{'type':'body'}},{})
        self.assertIn('配图尚不可用',out)
        self.assertIn(':::note',out)

    def test_heading_does_not_modify_math(self):
        blocks=parse_blocks('## Title $d_k$')
        out=render_blocks(blocks,{0:{'type':'heading','level':3}}, {})
        self.assertIn('### Title $d_k$',out)

    def fixture(self, text="**Fig. B.11.** Appendix image"):
        blocks = [{"id":209,"page":16,"text":text}]
        data = {"blocks":[{"id":209,"type":"caption"}],"figures":[{"caption_id":209,"page":16,"bbox":[0.1,0.2,0.9,0.8]}]}
        return blocks, data

    def test_numbered_and_appendix_captions(self):
        for caption in ["Fig. 11.", "Figure 2:", "**Fig. B.11.**", "Fig. B.12.", "Figure A-1.", "Fig. S1.", "图 B.11", "图1："]:
            with self.subTest(caption=caption):
                blocks,data=self.fixture(caption)
                labels,figures=parse_response(json.dumps(data),"stop",blocks,18)
                self.assertEqual(len(figures),1)
                self.assertEqual(labels[209]["type"],"caption")

    def test_figure_source_checks_remain_strict(self):
        for field,value in [("caption_id",210),("caption_id",True),("page",17),("page",True)]:
            with self.subTest(field=field,value=value):
                blocks,data=self.fixture();data["figures"][0][field]=value
                with self.assertRaises(LayoutFailure) as raised: parse_response(json.dumps(data),"stop",blocks,18)
                self.assertEqual(raised.exception.rule,"figure_source")
        blocks,data=self.fixture();data["blocks"][0]["type"]="body"
        with self.assertRaises(LayoutFailure): parse_response(json.dumps(data),"stop",blocks,18)
        blocks,data=self.fixture("Table B.11. Results")
        with self.assertRaises(LayoutFailure) as raised: parse_response(json.dumps(data),"stop",blocks,18)
        self.assertEqual(raised.exception.rule,"figure_caption")
        blocks,data=self.fixture()
        with self.assertRaises(LayoutFailure): parse_response(json.dumps(data),"stop",blocks,0)

    def test_invalid_crops_still_rejected(self):
        for bbox in [[0,0,0,1],[-1,0,1,1],[0,0,2,1],[False,0,1,1],[0,0,float("nan"),1],None]:
            blocks,data=self.fixture();data["figures"][0]["bbox"]=bbox
            with self.assertRaises(LayoutFailure) as raised: parse_response(json.dumps(data),"stop",blocks,18)
            self.assertEqual(raised.exception.rule,"figure_bbox")

    def test_model_shape_and_truncation_errors_are_controlled(self):
        blocks,data=self.fixture()
        cases=[("not json","stop","invalid_json"),(json.dumps(data),"length","output_truncated"),("[]","stop","invalid_structure"),('{"blocks":null}',"stop","invalid_structure"),('{"blocks":[]}',"stop","block_coverage")]
        for content,reason,rule in cases:
            with self.subTest(rule=rule):
                with self.assertRaises(LayoutFailure) as raised: parse_response(content,reason,blocks,18)
                self.assertEqual(raised.exception.rule,rule)
                self.assertIn("16",str(raised.exception))
        for labels in [[{"id":[],"type":"caption"}],[{"id":209,"type":[]}],[{"id":209,"type":"heading","level":True}]]:
            with self.assertRaises(LayoutFailure): validate(blocks,{"blocks":labels})

    def test_safe_failure_feedback_and_diagnostics(self):
        blocks,_=self.fixture("secret body API_KEY=never-log-this")
        stream=io.StringIO()
        with redirect_stderr(stream): message=failure_message(LayoutFailure("figure_caption",blocks,209))
        self.assertIn("无法识别图注编号",message)
        self.assertIn("16",message)
        self.assertNotIn("HTTP n/a",message)
        record=json.loads(stream.getvalue().removeprefix("RDLOG "))
        self.assertEqual(record["event"],"LAYOUT_VALIDATION_FAILED")
        self.assertEqual(record["attributes"]["blockId"],209)
        self.assertEqual(record["attributes"]["rule"],"figure_caption")
        self.assertNotIn("secret",message+stream.getvalue())
        self.assertEqual(failure_message(ValueError("private response")),"ValueError")
        error=RuntimeError("private response");error.status_code=429
        self.assertEqual(failure_message(error),"RuntimeError（HTTP 429）")

if __name__=='__main__': unittest.main()
