import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
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
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import type { CreativeSize, TextLayer, QAResult } from '@/types';

const SIZES: { value: CreativeSize; label: string; width: number; height: number }[] = [
  { value: '1:1', label: 'Square (1:1)', width: 400, height: 400 },
  { value: '4:5', label: 'Portrait (4:5)', width: 320, height: 400 },
  { value: '9:16', label: 'Story (9:16)', width: 225, height: 400 },
];

interface CreativeVariantData {
  id: string;
  name: string;
  intent_id: string;
  size: CreativeSize;
  status: string;
  text_layers_json: {
    layers: TextLayer[];
  };
  image_r2_key: string;
  qa_result_json?: QAResult;
}

export function CreativeEditorPage() {
  const { id, intentId, variantId } = useParams<{ id: string; intentId?: string; variantId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(intentId || null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(variantId || null);
  const [selectedSize, setSelectedSize] = useState<CreativeSize>('1:1');
  const [editedLayers, setEditedLayers] = useState<TextLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

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

  const { data: creativeVariants = [] } = useQuery({
    queryKey: ['creative-variants', selectedIntentId],
    queryFn: () => intentsApi.listCreativeVariants(selectedIntentId!),
    enabled: !!selectedIntentId,
  });

  const filteredVariants = creativeVariants.filter(
    (v) => ((v as unknown) as CreativeVariantData).size === selectedSize
  ) as unknown as CreativeVariantData[];

  const selectedVariant = filteredVariants.find((v) => v.id === selectedVariantId);
  const selectedLayer = editedLayers.find((l) => l.id === selectedLayerId);

  const sizeConfig = SIZES.find((s) => s.value === selectedSize) || SIZES[0];

  const initializeLayers = (variant: CreativeVariantData) => {
    const layers = variant.text_layers_json?.layers || [];
    setEditedLayers(layers);
    setSelectedLayerId(layers.length > 0 ? layers[0].id : null);
    setHasChanges(false);
  };

  const handleIntentChange = (newIntentId: string) => {
    setSelectedIntentId(newIntentId);
    setSelectedVariantId(null);
    setEditedLayers([]);
    setSelectedLayerId(null);
    setHasChanges(false);
  };

  const handleVariantChange = (newVariantId: string) => {
    setSelectedVariantId(newVariantId);
    const variant = filteredVariants.find((v) => v.id === newVariantId);
    if (variant) {
      initializeLayers(variant);
    }
  };

  const updateLayer = (layerId: string, updates: Partial<TextLayer>) => {
    setEditedLayers((layers) =>
      layers.map((layer) => (layer.id === layerId ? { ...layer, ...updates } : layer))
    );
    setHasChanges(true);
  };

  const addLayer = () => {
    const newLayer: TextLayer = {
      id: `layer-${Date.now()}`,
      text: 'New Text',
      x: 50,
      y: 50,
      width: 200,
      height: 50,
      fontSize: 24,
      fontWeight: 'normal',
      color: '#000000',
      align: 'center',
    };
    setEditedLayers([...editedLayers, newLayer]);
    setSelectedLayerId(newLayer.id);
    setHasChanges(true);
  };

  const removeLayer = (layerId: string) => {
    setEditedLayers((layers) => layers.filter((l) => l.id !== layerId));
    if (selectedLayerId === layerId) {
      setSelectedLayerId(editedLayers.length > 1 ? editedLayers[0].id : null);
    }
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // This would call an API to save the creative variant
      return new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['creative-variants', selectedIntentId] });
    },
  });

  const runQaMutation = useMutation({
    mutationFn: () => qaApi.checkCreativeVariant(selectedVariantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-variants', selectedIntentId] });
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
          <h1 className="text-3xl font-bold tracking-tight">Creative Editor</h1>
          <p className="text-muted-foreground mt-2">
            Edit banners for {run?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => runQaMutation.mutate()}
            disabled={!selectedVariantId || runQaMutation.isPending}
          >
            Run QA Check
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

      {/* Selection Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
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
              <Label>Size</Label>
              <div className="flex gap-2">
                {SIZES.map((size) => (
                  <Button
                    key={size.value}
                    variant={selectedSize === size.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSelectedSize(size.value);
                      setSelectedVariantId(null);
                      setEditedLayers([]);
                    }}
                  >
                    {size.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Variant</Label>
              <Select
                value={selectedVariantId || ''}
                onChange={(e) => handleVariantChange(e.target.value)}
                disabled={!selectedIntentId}
              >
                <SelectOption value="">Select a variant...</SelectOption>
                {filteredVariants.map((variant) => (
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
                {check.passed ? 'OK' : 'NG'}: {check.name}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {selectedVariant && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Canvas Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {sizeConfig.width} x {sizeConfig.height}px
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="relative border rounded-lg overflow-hidden mx-auto bg-gray-100"
                style={{
                  width: sizeConfig.width,
                  height: sizeConfig.height,
                }}
              >
                {/* Background Image */}
                {selectedVariant.image_r2_key && (
                  <img
                    src={`/api/assets/${selectedVariant.image_r2_key}`}
                    alt="Background"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}

                {/* Text Layers */}
                {editedLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`absolute cursor-pointer ${
                      selectedLayerId === layer.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    style={{
                      left: layer.x,
                      top: layer.y,
                      width: layer.width,
                      height: layer.height,
                      fontSize: layer.fontSize,
                      fontWeight: layer.fontWeight,
                      color: layer.color,
                      textAlign: layer.align,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: layer.align === 'center' ? 'center' : layer.align === 'right' ? 'flex-end' : 'flex-start',
                      overflow: 'hidden',
                    }}
                    onClick={() => setSelectedLayerId(layer.id)}
                  >
                    {layer.text}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Layer Editor */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Text Layers</CardTitle>
                  <Button size="sm" onClick={addLayer}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Layer
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {editedLayers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No text layers. Add one to get started.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {editedLayers.map((layer) => (
                      <div
                        key={layer.id}
                        className={`flex items-center justify-between p-2 border rounded cursor-pointer ${
                          selectedLayerId === layer.id ? 'border-blue-500 bg-blue-50' : ''
                        }`}
                        onClick={() => setSelectedLayerId(layer.id)}
                      >
                        <span className="text-sm truncate flex-1">{layer.text || 'Empty'}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLayer(layer.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Layer Properties */}
            {selectedLayer && (
              <Card>
                <CardHeader>
                  <CardTitle>Layer Properties</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Text</Label>
                    <Input
                      value={selectedLayer.text}
                      onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-4 grid-cols-2">
                    <div>
                      <Label>X Position</Label>
                      <Input
                        type="number"
                        value={selectedLayer.x}
                        onChange={(e) => updateLayer(selectedLayer.id, { x: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Y Position</Label>
                      <Input
                        type="number"
                        value={selectedLayer.y}
                        onChange={(e) => updateLayer(selectedLayer.id, { y: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 grid-cols-2">
                    <div>
                      <Label>Width</Label>
                      <Input
                        type="number"
                        value={selectedLayer.width}
                        onChange={(e) => updateLayer(selectedLayer.id, { width: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Height</Label>
                      <Input
                        type="number"
                        value={selectedLayer.height}
                        onChange={(e) => updateLayer(selectedLayer.id, { height: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 grid-cols-2">
                    <div>
                      <Label>Font Size</Label>
                      <Input
                        type="number"
                        value={selectedLayer.fontSize}
                        onChange={(e) => updateLayer(selectedLayer.id, { fontSize: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Font Weight</Label>
                      <Select
                        value={selectedLayer.fontWeight}
                        onChange={(e) => updateLayer(selectedLayer.id, { fontWeight: e.target.value as 'normal' | 'bold' })}
                      >
                        <SelectOption value="normal">Normal</SelectOption>
                        <SelectOption value="bold">Bold</SelectOption>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 grid-cols-2">
                    <div>
                      <Label>Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={selectedLayer.color}
                          onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={selectedLayer.color}
                          onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Alignment</Label>
                      <Select
                        value={selectedLayer.align}
                        onChange={(e) => updateLayer(selectedLayer.id, { align: e.target.value as 'left' | 'center' | 'right' })}
                      >
                        <SelectOption value="left">Left</SelectOption>
                        <SelectOption value="center">Center</SelectOption>
                        <SelectOption value="right">Right</SelectOption>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {!selectedVariant && selectedIntentId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a variant to start editing
          </CardContent>
        </Card>
      )}

      {!selectedIntentId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select an intent to view its creative variants
          </CardContent>
        </Card>
      )}
    </div>
  );
}
