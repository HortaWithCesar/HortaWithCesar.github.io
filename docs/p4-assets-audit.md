# P4 Assets Audit

Data: 2026-08-19

Este relatório é apenas inventário. Nenhuma imagem ou vídeo foi apagado, comprimido, substituído ou renomeado.

## Resumo

- Assets locais referenciados pelo `index.html`: 70.
- Assets de media não referenciados pelo `index.html`: 9.
- Duplicados byte-a-byte: 3 grupos.
- Possíveis duplicados visuais com nomes diferentes: 2 pares.
- Imagens/vídeos acima de 2 MB: 39 ficheiros, cerca de 283.11 MB.
- Potencial economia estimada:
  - até 39.48 MB se todos os media não referenciados forem aprovados para remoção;
  - cerca de 25.12 MB em cópias exatas não referenciadas que têm par usado no site;
  - cerca de 5.15 MB se for mantida apenas uma das duas fotos duplicadas `foto-contacto.jpg` / `Foto.cesar.trilho.jpg`;
  - cerca de 141.55 MB a 158.30 MB se os assets acima de 2 MB forem otimizados com compressão/resizing/reencode conservador.

## Ficheiros atualmente usados pelo index.html

- `Gmail-Logo.png`
- `Pico c hortencias11.jpg`
- `foto-perfil.jpg`
- `img/braca/braca-1.jpg`
- `img/braca/braca-2.jpg`
- `img/braca/braca-3.jpg`
- `img/braca/braca-4.jpg`
- `img/braca/braca-5.jpg`
- `img/braca/braca-6.jpg`
- `img/braca/braca-video.mp4`
- `img/caldeira-descida/caldeira-descida-1.jpg`
- `img/caldeira-descida/caldeira-descida-2.jpg`
- `img/caldeira-descida/caldeira-descida-3.jpg`
- `img/caldeira-descida/caldeira-descida-4.jpg`
- `img/caldeira-descida/caldeira-descida-5.jpg`
- `img/caldeira-descida/caldeira-descida-6.jpg`
- `img/caldeira-descida/caldeira-descida-video.mp4`
- `img/caldeira/caldeira-1.jpg`
- `img/caldeira/caldeira-2.jpg`
- `img/caldeira/caldeira-3.jpg`
- `img/caldeira/caldeira-4.jpg`
- `img/caldeira/caldeira-5.jpg`
- `img/caldeira/caldeira-6.jpg`
- `img/caldeira/caldeira-video.mp4`
- `img/capelo/capelo-1.jpg`
- `img/capelo/capelo-2.jpg`
- `img/capelo/capelo-3.jpg`
- `img/capelo/capelo-4.jpg`
- `img/capelo/capelo-5.jpg`
- `img/capelo/capelo-video.mp4`
- `img/city-tour/City.tour.Colonia.jpg`
- `img/city-tour/City.tour.ILF1.jpg`
- `img/city-tour/City.tour.Igreja.jpg`
- `img/city-tour/City.tour.JFT.jpg`
- `img/city-tour/City.tour.JFT2.jpg`
- `img/city-tour/City.tour.Matriz.jpg`
- `img/city-tour/VID.citytour.mp4`
- `img/contact-slider/contact-1.jpg`
- `img/contact-slider/contact-2.jpg`
- `img/contact-slider/contact-3.jpg`
- `img/contact-slider/contact-4.jpg`
- `img/contact-slider/contact-5.jpg`
- `img/contact-slider/contact-6.jpg`
- `img/contact-slider/contact-7.jpg`
- `img/contact-slider/contact-8.jpg`
- `img/entre-montes/entre-montes-1.jpg`
- `img/entre-montes/entre-montes-2.jpg`
- `img/entre-montes/entre-montes-3.jpg`
- `img/entre-montes/entre-montes-4.jpg`
- `img/entre-montes/entre-montes-5.jpg`
- `img/entre-montes/entre-montes-6.jpg`
- `img/entre-montes/entre-montes-video.mp4`
- `img/facebook.svg`
- `img/instagram.svg`
- `img/neptuno/neptuno-1.jpg`
- `img/neptuno/neptuno-2.jpg`
- `img/neptuno/neptuno-3.jpg`
- `img/neptuno/neptuno-4.jpg`
- `img/neptuno/neptuno-5.jpg`
- `img/neptuno/neptuno-6.jpg`
- `img/neptuno/neptuno-video.mp4`
- `img/rocha-faja/rocha-faja-1.jpg`
- `img/rocha-faja/rocha-faja-2.jpg`
- `img/rocha-faja/rocha-faja-3.jpg`
- `img/rocha-faja/rocha-faja-4.jpg`
- `img/rocha-faja/rocha-faja-5.jpg`
- `img/rocha-faja/rocha-faja-6.jpg`
- `img/rocha-faja/rocha-faja-video.mp4`
- `logotipo1.png`
- `whatsapp-logo.png`

## Ficheiros não referenciados

Ficheiros técnicos vazios como `.gitkeep` não foram contados como assets de media.

- `20251107_1544_Logotipo para Estampagem_remix_01k9fk7129fh694h98qcnajpsr.png` - 2.08 MB
- `Foto.Pico.jpg` - 2.49 MB
- `Foto.cesar.trilho.jpg` - 5.15 MB
- `foto-contacto.jpg` - 5.15 MB
- `img/capelo/capelo-6.jpg` - 1.26 MB
- `img/entre-montes/entre-montes-video.mp4.mp4` - 23.04 MB
- `img/reviews/tania-cardoso.jpg` - 0.13 MB
- `instagram-logo.png` - 0.001 MB
- `whatsapp-icon.jpg` - 0.03 MB

Total aproximado: 39.48 MB.

## Duplicados byte-a-byte

- `20251107_1544_Logotipo para Estampagem_remix_01k9fk7129fh694h98qcnajpsr.png` e `logotipo1.png` - 2.08 MB cada.
- `foto-contacto.jpg` e `Foto.cesar.trilho.jpg` - 5.15 MB cada.
- `img/entre-montes/entre-montes-video.mp4` e `img/entre-montes/entre-montes-video.mp4.mp4` - 23.04 MB cada.

Potencial economia sem mexer nos ficheiros usados: cerca de 25.12 MB, removendo apenas a cópia do logotipo com nome longo e a cópia `.mp4.mp4`, se aprovado.

## Duplicados visuais com nomes diferentes

Detetados por hash perceptual, sujeitos a confirmação visual antes de qualquer ação:

- `foto-contacto.jpg` e `img/contact-slider/contact-8.jpg` parecem ser a mesma foto, com dimensões/tamanho diferentes.
- `Foto.cesar.trilho.jpg` e `img/contact-slider/contact-8.jpg` parecem ser a mesma foto, com dimensões/tamanho diferentes.

Como `img/contact-slider/contact-8.jpg` está usado no site e é muito mais leve, a decisão provável seria manter esse ficheiro e remover apenas os originais não referenciados, se aprovado.

## Vídeos/imagens acima de 2 MB

- `img/rocha-faja/rocha-faja-video.mp4` - 23.21 MB
- `img/entre-montes/entre-montes-video.mp4` - 23.04 MB
- `img/entre-montes/entre-montes-video.mp4.mp4` - 23.04 MB
- `img/braca/braca-video.mp4` - 22.49 MB
- `img/caldeira/caldeira-video.mp4` - 18.49 MB
- `img/caldeira-descida/caldeira-descida-video.mp4` - 17.62 MB
- `img/neptuno/neptuno-video.mp4` - 16.86 MB
- `img/capelo/capelo-video.mp4` - 12.86 MB
- `img/caldeira/caldeira-4.jpg` - 12.22 MB
- `img/city-tour/VID.citytour.mp4` - 9.86 MB
- `img/caldeira/caldeira-3.jpg` - 6.14 MB
- `img/caldeira-descida/caldeira-descida-3.jpg` - 6.00 MB
- `img/entre-montes/entre-montes-2.jpg` - 5.51 MB
- `foto-contacto.jpg` - 5.15 MB
- `Foto.cesar.trilho.jpg` - 5.15 MB
- `img/rocha-faja/rocha-faja-5.jpg` - 5.03 MB
- `img/caldeira-descida/caldeira-descida-2.jpg` - 4.58 MB
- `img/city-tour/City.tour.JFT2.jpg` - 4.19 MB
- `img/city-tour/City.tour.JFT.jpg` - 4.18 MB
- `img/caldeira/caldeira-5.jpg` - 3.81 MB
- `img/caldeira-descida/caldeira-descida-4.jpg` - 3.60 MB
- `img/neptuno/neptuno-6.jpg` - 3.42 MB
- `img/neptuno/neptuno-5.jpg` - 3.35 MB
- `img/neptuno/neptuno-1.jpg` - 3.23 MB
- `img/caldeira/caldeira-2.jpg` - 3.21 MB
- `img/rocha-faja/rocha-faja-1.jpg` - 3.14 MB
- `img/caldeira-descida/caldeira-descida-5.jpg` - 3.10 MB
- `img/city-tour/City.tour.Matriz.jpg` - 3.07 MB
- `img/rocha-faja/rocha-faja-4.jpg` - 2.91 MB
- `img/rocha-faja/rocha-faja-2.jpg` - 2.91 MB
- `img/caldeira-descida/caldeira-descida-1.jpg` - 2.78 MB
- `img/caldeira/caldeira-6.jpg` - 2.77 MB
- `img/rocha-faja/rocha-faja-3.jpg` - 2.76 MB
- `img/neptuno/neptuno-2.jpg` - 2.74 MB
- `Foto.Pico.jpg` - 2.49 MB
- `20251107_1544_Logotipo para Estampagem_remix_01k9fk7129fh694h98qcnajpsr.png` - 2.08 MB
- `logotipo1.png` - 2.08 MB
- `foto-perfil.jpg` - 2.01 MB
- `img/braca/braca-5.jpg` - 2.01 MB

Total aproximado acima de 2 MB: 283.11 MB.

## Próxima ação recomendada

Manter este relatório como base de decisão. Numa fase futura, aprovar explicitamente quais ficheiros podem ser removidos e quais imagens/vídeos devem ser otimizados, validando visualmente o site depois de cada lote.
