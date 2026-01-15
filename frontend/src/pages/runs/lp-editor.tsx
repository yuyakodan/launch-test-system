import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Textarea,
  Select,
  SelectOption,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/ui';
import { runsApi, intentsApi, qaApi } from '@/api';
import {
  ArrowLeft,
  Save,
  Eye,
  AlertCircle,
  CheckCircle,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { LpBlockType, LpBlock, QAResult } from '@/types';

const blockTypes: { type: LpBlockType; label: string; description: string }[] = [
  { type: 'fv', label: 'First View', description: 'Hero section with main headline and CTA' },
  { type: 'empathy', label: 'Empathy', description: 'Problem statement and user pain points' },
  { type: 'solution', label: 'Solution', description: 'Product/service solution overview' },
  { type: 'proof', label: 'Proof', description: 'Evidence, testimonials, statistics' },
  { type: 'steps', label: 'Steps', description: 'How it works / process steps' },
  { type: 'faq', label: 'FAQ', description: 'Frequently asked questions' },
  { type: 'cta', label: 'CTA', description: 'Call to action section' },
  { type: 'disclaimer', label: 'Disclaimer', description: 'Legal disclaimers and notes' },
];

const getBlockTypeInfo = (type: LpBlockType) => {
  return blockTypes.find((b) => b.type === type) || { type, label: type, description: '' };
};

interface LpVariantData {
  id: string;
  name: string;
  intent_id: string;
  status: string;
  blocks_json: {
    blocks: LpBlock[];
  };
  qa_result_json?: QAResult;
}

export function LpEditorPage() {
  const { id, intentId, variantId } = useParams<{ id: string; intentId?: string; variantId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(intentId || null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(variantId || null);
  const [editedBlocks, setEditedBlocks] = useState<LpBlock[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data: run } = useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.get(id!),
    enabled: !!id,
  });

  const { data: intents = [] } = useQuery({
    queryKey: ['intents', id],
    queryFn: () => intentsApi.list(id!),
    enabled: !!id,
  });

  const { data: lpVariants = [] } = useQuery({
    queryKey: ['lp-variants', selectedIntentId],
    queryFn: () => intentsApi.listLpVariants(selectedIntentId!),
    enabled: !!selectedIntentId,
  });

  const selectedVariant = lpVariants.find((v) => v.id === selectedVariantId) as LpVariantData | undefined;

  // Initialize blocks when variant changes
  const initializeBlocks = (variant: LpVariantData) => {
    const blocks = variant.blocks_json?.blocks || [];
    setEditedBlocks(blocks);
    setHasChanges(false);
  };

  const handleIntentChange = (newIntentId: string) => {
    setSelectedIntentId(newIntentId);
    setSelectedVariantId(null);
    setEditedBlocks([]);
    setHasChanges(false);
  };

  const handleVariantChange = (newVariantId: string) => {
    setSelectedVariantId(newVariantId);
    const variant = lpVariants.find((v) => v.id === newVariantId) as LpVariantData | undefined;
    if (variant) {
      initializeBlocks(variant);
    }
  };

  const updateBlock = (blockId: string, updates: Partial<LpBlock>) => {
    setEditedBlocks((blocks) =>
      blocks.map((block) => (block.id === blockId ? { ...block, ...updates } : block))
    );
    setHasChanges(true);
  };

  const updateBlockContent = (blockId: string, contentKey: string, value: string) => {
    setEditedBlocks((blocks) =>
      blocks.map((block) =>
        block.id === blockId
          ? { ...block, content: { ...block.content, [contentKey]: value } }
          : block
      )
    );
    setHasChanges(true);
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...editedBlocks];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newBlocks.length) return;

    [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
    newBlocks.forEach((block, i) => (block.order = i));
    setEditedBlocks(newBlocks);
    setHasChanges(true);
  };

  const addBlock = (type: LpBlockType) => {
    const newBlock: LpBlock = {
      id: `block-${Date.now()}`,
      type,
      order: editedBlocks.length,
      content: getDefaultContent(type),
      visible: true,
    };
    setEditedBlocks([...editedBlocks, newBlock]);
    setHasChanges(true);
  };

  const removeBlock = (blockId: string) => {
    setEditedBlocks((blocks) => blocks.filter((b) => b.id !== blockId));
    setHasChanges(true);
  };

  const getDefaultContent = (type: LpBlockType): Record<string, unknown> => {
    switch (type) {
      case 'fv':
        return { headline: '', subheadline: '', ctaText: '', backgroundImage: '' };
      case 'empathy':
        return { title: '', problems: [] };
      case 'solution':
        return { title: '', description: '', features: [] };
      case 'proof':
        return { title: '', items: [] };
      case 'steps':
        return { title: '', steps: [] };
      case 'faq':
        return { title: '', items: [] };
      case 'cta':
        return { headline: '', buttonText: '', note: '' };
      case 'disclaimer':
        return { text: '' };
      default:
        return {};
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // This would call an API to save the LP variant
      // For now, we'll simulate the save
      return new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['lp-variants', selectedIntentId] });
    },
  });

  const runQaMutation = useMutation({
    mutationFn: () => qaApi.checkLpVariant(selectedVariantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lp-variants', selectedIntentId] });
    },
  });

  const qaResult = selectedVariant?.qa_result_json;
  const hasBlockers = qaResult?.checks?.some((c) => !c.passed) || false;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/runs/${id}`)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Run
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">LP Editor</h1>
          <p className="text-muted-foreground mt-2">
            Edit landing page blocks for {run?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="mr-2 h-4 w-4" />
            {showPreview ? 'Hide Preview' : 'Preview'}
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Intent and Variant Selection */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Intent</Label>
              <Select
                value={selectedIntentId || ''}
                onChange={(e) => handleIntentChange(e.target.value)}
              >
                <SelectOption value="">Select an intent...</SelectOption>
                {intents.map((intent) => (
                  <SelectOption key={intent.id} value={intent.id}>
                    {intent.name || (intent as { title?: string }).title}
                  </SelectOption>
                ))}
              </Select>
            </div>
            <div>
              <Label>LP Variant</Label>
              <Select
                value={selectedVariantId || ''}
                onChange={(e) => handleVariantChange(e.target.value)}
                disabled={!selectedIntentId}
              >
                <SelectOption value="">Select a variant...</SelectOption>
                {lpVariants.map((variant) => (
                  <SelectOption key={variant.id} value={variant.id}>
                    {variant.name || `Variant ${variant.id.slice(-6)}`}
                  </SelectOption>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QA Result Alert */}
      {qaResult && (
        <Alert className={hasBlockers ? 'border-red-200' : 'border-green-200'}>
          {hasBlockers ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          <AlertTitle>
            QA Result: {hasBlockers ? 'Issues Found' : 'Passed'}
          </AlertTitle>
          <AlertDescription>
            {qaResult.checks?.map((check, i) => (
              <div key={i} className={`text-sm ${check.passed ? 'text-green-600' : 'text-red-600'}`}>
                {check.passed ? 'OK' : 'NG'}: {check.name} {check.message && `- ${check.message}`}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {selectedVariant && (
        <div className={`grid gap-6 ${showPreview ? 'md:grid-cols-2' : ''}`}>
          {/* Block Editor */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Blocks</h2>
              <div className="flex gap-2">
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addBlock(e.target.value as LpBlockType);
                    }
                  }}
                >
                  <SelectOption value="">+ Add Block</SelectOption>
                  {blockTypes.map((bt) => (
                    <SelectOption key={bt.type} value={bt.type}>
                      {bt.label}
                    </SelectOption>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  onClick={() => runQaMutation.mutate()}
                  disabled={runQaMutation.isPending}
                >
                  Run QA Check
                </Button>
              </div>
            </div>

            {editedBlocks.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No blocks yet. Add blocks using the dropdown above.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {editedBlocks.map((block, index) => {
                  const blockInfo = getBlockTypeInfo(block.type);
                  return (
                    <Card key={block.id} className={!block.visible ? 'opacity-50' : ''}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <Badge variant="outline">{blockInfo.label}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {blockInfo.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => moveBlock(index, 'up')}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => moveBlock(index, 'down')}
                              disabled={index === editedBlocks.length - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateBlock(block.id, { visible: !block.visible })}
                            >
                              <Eye className={`h-4 w-4 ${!block.visible ? 'text-muted-foreground' : ''}`} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeBlock(block.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {renderBlockEditor(block, updateBlockContent)}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview Panel */}
          {showPreview && (
            <div className="sticky top-4">
              <Card className="h-[600px] overflow-auto">
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {editedBlocks.filter((b) => b.visible).map((block) => (
                      <div key={block.id} className="border-b pb-4 last:border-0">
                        {renderBlockPreview(block)}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {!selectedVariant && selectedIntentId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select an LP variant to start editing
          </CardContent>
        </Card>
      )}

      {!selectedIntentId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select an intent to view its LP variants
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function renderBlockEditor(
  block: LpBlock,
  updateContent: (blockId: string, key: string, value: string) => void
) {
  const content = block.content as Record<string, string | string[]>;

  switch (block.type) {
    case 'fv':
      return (
        <div className="space-y-4">
          <div>
            <Label>Headline</Label>
            <Input
              value={(content.headline as string) || ''}
              onChange={(e) => updateContent(block.id, 'headline', e.target.value)}
              placeholder="Main headline..."
            />
          </div>
          <div>
            <Label>Subheadline</Label>
            <Input
              value={(content.subheadline as string) || ''}
              onChange={(e) => updateContent(block.id, 'subheadline', e.target.value)}
              placeholder="Supporting text..."
            />
          </div>
          <div>
            <Label>CTA Button Text</Label>
            <Input
              value={(content.ctaText as string) || ''}
              onChange={(e) => updateContent(block.id, 'ctaText', e.target.value)}
              placeholder="e.g., Get Started"
            />
          </div>
        </div>
      );

    case 'empathy':
      return (
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={(content.title as string) || ''}
              onChange={(e) => updateContent(block.id, 'title', e.target.value)}
              placeholder="Section title..."
            />
          </div>
          <div>
            <Label>Problem Description</Label>
            <Textarea
              value={(content.description as string) || ''}
              onChange={(e) => updateContent(block.id, 'description', e.target.value)}
              placeholder="Describe the problem..."
              rows={4}
            />
          </div>
        </div>
      );

    case 'solution':
      return (
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={(content.title as string) || ''}
              onChange={(e) => updateContent(block.id, 'title', e.target.value)}
              placeholder="Solution title..."
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={(content.description as string) || ''}
              onChange={(e) => updateContent(block.id, 'description', e.target.value)}
              placeholder="Describe the solution..."
              rows={4}
            />
          </div>
        </div>
      );

    case 'proof':
      return (
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={(content.title as string) || ''}
              onChange={(e) => updateContent(block.id, 'title', e.target.value)}
              placeholder="e.g., Why Trust Us"
            />
          </div>
          <div>
            <Label>Evidence Text</Label>
            <Textarea
              value={(content.text as string) || ''}
              onChange={(e) => updateContent(block.id, 'text', e.target.value)}
              placeholder="Statistics, testimonials..."
              rows={4}
            />
          </div>
        </div>
      );

    case 'steps':
      return (
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={(content.title as string) || ''}
              onChange={(e) => updateContent(block.id, 'title', e.target.value)}
              placeholder="e.g., How It Works"
            />
          </div>
          <div>
            <Label>Steps (one per line)</Label>
            <Textarea
              value={(content.stepsText as string) || ''}
              onChange={(e) => updateContent(block.id, 'stepsText', e.target.value)}
              placeholder="Step 1: ...\nStep 2: ...\nStep 3: ..."
              rows={4}
            />
          </div>
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={(content.title as string) || ''}
              onChange={(e) => updateContent(block.id, 'title', e.target.value)}
              placeholder="e.g., Frequently Asked Questions"
            />
          </div>
          <div>
            <Label>FAQ Items (Q: and A: format)</Label>
            <Textarea
              value={(content.faqText as string) || ''}
              onChange={(e) => updateContent(block.id, 'faqText', e.target.value)}
              placeholder="Q: Question?\nA: Answer.\n\nQ: Another question?\nA: Another answer."
              rows={6}
            />
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className="space-y-4">
          <div>
            <Label>Headline</Label>
            <Input
              value={(content.headline as string) || ''}
              onChange={(e) => updateContent(block.id, 'headline', e.target.value)}
              placeholder="e.g., Ready to Get Started?"
            />
          </div>
          <div>
            <Label>Button Text</Label>
            <Input
              value={(content.buttonText as string) || ''}
              onChange={(e) => updateContent(block.id, 'buttonText', e.target.value)}
              placeholder="e.g., Start Free Trial"
            />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input
              value={(content.note as string) || ''}
              onChange={(e) => updateContent(block.id, 'note', e.target.value)}
              placeholder="e.g., No credit card required"
            />
          </div>
        </div>
      );

    case 'disclaimer':
      return (
        <div>
          <Label>Disclaimer Text</Label>
          <Textarea
            value={(content.text as string) || ''}
            onChange={(e) => updateContent(block.id, 'text', e.target.value)}
            placeholder="Legal disclaimer..."
            rows={4}
          />
        </div>
      );

    default:
      return (
        <div className="text-muted-foreground">
          No editor available for this block type
        </div>
      );
  }
}

function renderBlockPreview(block: LpBlock) {
  const content = block.content as Record<string, string>;

  switch (block.type) {
    case 'fv':
      return (
        <div className="text-center py-8 bg-gradient-to-b from-blue-50 to-white rounded">
          <h1 className="text-2xl font-bold">{content.headline || 'Headline'}</h1>
          <p className="text-muted-foreground mt-2">{content.subheadline || 'Subheadline'}</p>
          <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">
            {content.ctaText || 'CTA'}
          </button>
        </div>
      );

    case 'empathy':
      return (
        <div className="py-4">
          <h2 className="text-xl font-semibold">{content.title || 'Empathy Section'}</h2>
          <p className="mt-2 text-muted-foreground">{content.description || 'Problem description...'}</p>
        </div>
      );

    case 'solution':
      return (
        <div className="py-4">
          <h2 className="text-xl font-semibold">{content.title || 'Solution Section'}</h2>
          <p className="mt-2 text-muted-foreground">{content.description || 'Solution description...'}</p>
        </div>
      );

    case 'proof':
      return (
        <div className="py-4 bg-gray-50 rounded p-4">
          <h2 className="text-xl font-semibold">{content.title || 'Proof Section'}</h2>
          <p className="mt-2 text-muted-foreground">{content.text || 'Evidence...'}</p>
        </div>
      );

    case 'steps':
      return (
        <div className="py-4">
          <h2 className="text-xl font-semibold">{content.title || 'Steps'}</h2>
          <div className="mt-2 text-muted-foreground whitespace-pre-line">
            {content.stepsText || 'Steps...'}
          </div>
        </div>
      );

    case 'faq':
      return (
        <div className="py-4">
          <h2 className="text-xl font-semibold">{content.title || 'FAQ'}</h2>
          <div className="mt-2 text-muted-foreground whitespace-pre-line">
            {content.faqText || 'FAQ items...'}
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className="text-center py-8 bg-blue-50 rounded">
          <h2 className="text-xl font-bold">{content.headline || 'CTA Headline'}</h2>
          <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">
            {content.buttonText || 'Button'}
          </button>
          {content.note && <p className="mt-2 text-sm text-muted-foreground">{content.note}</p>}
        </div>
      );

    case 'disclaimer':
      return (
        <div className="py-4 text-xs text-muted-foreground">
          {content.text || 'Disclaimer text...'}
        </div>
      );

    default:
      return <div className="text-muted-foreground">Preview not available</div>;
  }
}
