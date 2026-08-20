import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  imports: [ButtonModule, RouterLink],
  selector: 'app-sem-acesso',
  styleUrl: './sem-acesso.scss',
  templateUrl: './sem-acesso.html',
})
export class SemAcesso {}
