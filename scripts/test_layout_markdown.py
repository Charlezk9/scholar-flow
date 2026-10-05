import unittest
from layout_markdown import parse_blocks, validate, render_blocks

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

if __name__=='__main__': unittest.main()
